import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, "..", "src", "content", "news");
const MATCHES_PATH = resolve(__dirname, "..", "src", "data", "gamechangers.json");
const PLAYERS_PATH = resolve(__dirname, "..", "src", "data", "players.json");
const TABLE_PATH = resolve(__dirname, "..", "src", "data", "table.json");
const FIXTURES_PATH = resolve(__dirname, "..", "src", "data", "fixtures.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const gcData = JSON.parse(readFileSync(MATCHES_PATH, "utf8"));
const playerData = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
const tableData = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
const fixturesData = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

const allMatches = Object.values(gcData.seasons).flatMap(s => s.matches)
  .filter(m => (m.homeScore > 0 || m.awayScore > 0) && m.gamechanger1.type !== "unknown");

// Default to Season 3 only — use --season=all for all seasons
const targetSeason = process.argv.includes("--season=all") ? null : "3";
const matches = targetSeason
  ? gcData.seasons[targetSeason]?.matches.filter(m => (m.homeScore > 0 || m.awayScore > 0) && m.gamechanger1.type !== "unknown") || []
  : allMatches;

const players = playerData.players;

function getTopScorer(teamSlug) {
  const squad = players.filter(p => p.teamSlug === teamSlug && (p.seasons?.["3"]?.goals || 0) > 0);
  squad.sort((a, b) => (b.seasons?.["3"]?.goals || 0) - (a.seasons?.["3"]?.goals || 0));
  return squad[0] || null;
}

function getTeamPosition(slug) {
  const t = tableData.find(r => r.slug === slug);
  return t ? t.pos : null;
}

function winMargin(hs, as) { return hs - as; }

function describeWin(margin) {
  if (margin >= 5) return { adj: "demolished", emphatic: true, close: false };
  if (margin >= 3) return { adj: "dominated", emphatic: true, close: false };
  if (margin >= 2) return { adj: "defeated", emphatic: false, close: false };
  return { adj: "edged past", emphatic: false, close: true };
}

function describeGC(gc1Type, gc2Type, gc1Goals, gc2Goals) {
  const parts = [];
  const total = gc1Goals + gc2Goals;
  if (total >= 5) parts.push("The Game Changer period erupted into life with");
  else if (total >= 2) parts.push("The Game Changer brought");
  else if (total === 0) parts.push("The Game Changer period passed quietly without");
  else parts.push("The Game Changer period saw");

  if (total > 0) {
    parts.push(`${total} goals across both activations.`);
    if (gc1Goals > 0) parts.push(`The 1st half ${gc1Type} produced ${gc1Goals} goal${gc1Goals > 1 ? "s" : ""}.`);
    if (gc2Goals > 0) parts.push(`${thePrefix(gc2Type, true)}${gc2Type} added ${gc2Goals} more in the 2nd half.`);
  } else {
    parts.push("a single goal being scored.");
  }
  return parts.join(" ");
}

function gcNames(type) {
  const map = {
    onside: "Onside", plusone: "Plus One", "3play": "3Play",
    "1on1": "1-on-1", theline: "The Line", fairplay: "Fairplay",
  };
  return map[type] || type;
}

function thePrefix(name, cap) {
  if (name.startsWith("The ") || name.startsWith("1-")) return "";
  return cap ? "The " : "the ";
}

function generateReport(match) {
  const home = match.homeTeam;
  const away = match.awayTeam;
  const hs = match.homeScore;
  const as = match.awayScore;
  const gw = match.gameweek;
  const margin = winMargin(hs, as);
  const winner = hs > as ? home : as > hs ? away : null;
  const loser = winner === home ? away : home;
  const desc = winner ? describeWin(Math.abs(margin)) : { adj: "drew with", close: true };

  const homeScorer = getTopScorer(match.homeSlug);
  const awayScorer = getTopScorer(match.awaySlug);
  const homePos = getTeamPosition(match.homeSlug);
  const awayPos = getTeamPosition(match.awaySlug);

  const gc1 = gcNames(match.gamechanger1.type);
  const gc2 = gcNames(match.gamechanger2.type);
  const gc1g = match.gamechanger1.goalsScored;
  const gc2g = match.gamechanger2.goalsScored;

  const homeNext = fixturesData.upcoming.find(f => f.homeSlug === match.homeSlug || f.awaySlug === match.homeSlug);
  const awayNext = fixturesData.upcoming.find(f => f.homeSlug === match.awaySlug || f.awaySlug === match.awaySlug);

  const titleWinner = winner || `${home} and ${away}`;
  const titleAction = winner ? (desc.adj === "demolished" ? "Crush" : desc.adj === "dominated" ? "Dominate" : "Beat") : "Battle to Draw with";
  const title = `${titleWinner} ${titleAction} ${winner ? loser : ""} ${hs}-${as} in Gameweek ${gw}`.replace(/\s+/g, " ").trim();

  const slug = `${match.homeSlug}-vs-${match.awaySlug}-gw${gw}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const excerpt = `${home} ${hs}-${as} ${away} — Gameweek ${gw}. ` +
    (homeScorer ? `${homeScorer.name} leads ${home} with ${homeScorer.seasons?.["3"]?.goals || 0} goals. ` : "") +
    `Game Changers: ${gc1} (${gc1g} goals) and ${gc2} (${gc2g} goals).`;

  const date = new Date();
  const dateStr = date.toISOString().split("T")[0];

  const content = `---
title: "${title}"
date: ${dateStr}
category: "Match Report"
excerpt: "${excerpt}"
author: "Baller League UK Fan Site"
featured: ${hs + as >= 12}
---

## ${home} ${hs}-${as} ${away} — Gameweek ${gw} Report

${winner
    ? `${winner} ${desc.adj} ${loser} ${hs}-${as} at Baller Arena in Gameweek ${gw}${desc.emphatic ? " in an emphatic display" : desc.close ? " in a tight contest" : ""}. `
    : `${home} and ${away} played out an entertaining ${hs}-${as} draw at Baller Arena. `
}${homePos ? `${home} came into the match sitting ${homePos}${ordinalSuffix(homePos)} in the table` : ""}${awayPos ? `, while ${away} were ${awayPos}${ordinalSuffix(awayPos)}` : ""}.

## First Half

The first half saw the ${gc1} Game Changer activate at the 12th minute${gc1g > 0 ? `, producing ${gc1g} goal${gc1g > 1 ? "s" : ""}` : " but neither side could capitalise"}. ${winner ? `${winner} established control early` : "The sides went into the break level"} with an attacking display that set the tone for the match.

## Second Half

${thePrefix(gc2, true)}${gc2} Game Changer kicked in at the 27th minute${gc2g > 0 ? `, adding ${gc2g} goal${gc2g > 1 ? "s" : ""} to the game` : ", but goals proved hard to come by"}. ${winner ? `${winner} ${desc.close ? "held their nerve to" : "cruised to"} a ${Math.abs(margin)}-goal victory` : `Neither side could find a winner as the match ended all square`}.

## The Game Changer

${describeGC(gc1, gc2, gc1g, gc2g)}

## Talking Points

${homeScorer ? `- **${homeScorer.name}** leads ${home} with ${homeScorer.seasons?.["3"]?.goals || 0} goals this season` : "-"}
${awayScorer ? `- **${awayScorer.name}** tops the scoring charts for ${away} with ${awayScorer.seasons?.["3"]?.goals || 0} goals` : ""}
- ${thePrefix(gc1, true)}${gc1} and ${thePrefix(gc2)}${gc2} Game Changers produced ${gc1g + gc2g} goals combined
${margin >= 5 ? `- This was ${winner}'s biggest winning margin of the season` : ""}
${margin === 0 ? "- A fair result — both sides will take a point from a hard-fought encounter" : ""}

## What's Next

${homeNext ? `${home} face ${homeNext.homeTeam === home ? homeNext.awayTeam : homeNext.homeTeam} in the next gameweek.` : `${home} await their next fixture.`}
${awayNext ? `${away} take on ${awayNext.homeTeam === away ? awayNext.awayTeam : awayNext.homeTeam} in the next gameweek.` : `${away} await their next fixture.`}
`;

  return { slug, content };
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return "th";
  const mod = n % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

console.log(`Generating match reports for ${matches.length} matches (Season ${targetSeason || "all"})...\n`);

let generated = 0;
const seen = new Set();

for (const match of matches) {
  const { slug, content } = generateReport(match);

  // Deduplicate by slug
  if (seen.has(slug)) continue;
  seen.add(slug);

  const filePath = resolve(CONTENT_DIR, `${slug}.md`);
  writeFileSync(filePath, content);
  generated++;
  console.log(`  ${slug}.md`);
}

console.log(`\nDone! ${generated} match reports generated in ${CONTENT_DIR}`);
