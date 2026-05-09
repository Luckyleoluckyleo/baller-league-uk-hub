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

// ─── Helpers ───────────────────────────────────────────────────

function getTopScorers(teamSlug, limit = 3) {
  const squad = players.filter(p => p.teamSlug === teamSlug && (p.seasons?.["3"]?.goals || 0) > 0);
  squad.sort((a, b) => (b.seasons?.["3"]?.goals || 0) - (a.seasons?.["3"]?.goals || 0));
  return squad.slice(0, limit);
}

function getTopScorer(teamSlug) {
  const s = getTopScorers(teamSlug, 1);
  return s[0] || null;
}

function getTeamForm(teamSlug, beforeGW, maxGames = 5) {
  const teamMatches = matches
    .filter(m => m.gameweek < beforeGW)
    .filter(m => m.homeSlug === teamSlug || m.awaySlug === teamSlug)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, maxGames);
  return teamMatches.map(m => {
    const isHome = m.homeSlug === teamSlug;
    const gd = isHome ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
    if (gd > 0) return 'W';
    if (gd < 0) return 'L';
    return 'D';
  });
}

function getH2H(homeSlug, awaySlug, beforeGW) {
  const prev = matches.filter(m =>
    m.gameweek < beforeGW &&
    ((m.homeSlug === homeSlug && m.awaySlug === awaySlug) ||
     (m.homeSlug === awaySlug && m.awaySlug === homeSlug))
  );
  let hw = 0, aw = 0, dr = 0, hgf = 0, hga = 0;
  for (const m of prev) {
    const isHome = m.homeSlug === homeSlug;
    if (isHome) {
      hgf += m.homeScore; hga += m.awayScore;
      if (m.homeScore > m.awayScore) hw++;
      else if (m.awayScore > m.homeScore) aw++;
      else dr++;
    } else {
      hgf += m.awayScore; hga += m.homeScore;
      if (m.awayScore > m.homeScore) hw++;
      else if (m.homeScore > m.awayScore) aw++;
      else dr++;
    }
  }
  return { played: prev.length, won: hw, drawn: dr, lost: aw, gf: hgf, ga: hga };
}

function computeStandings(beforeGW) {
  const records = {};
  const prevMatches = matches.filter(m => m.gameweek < beforeGW);
  for (const m of prevMatches) {
    if (!records[m.homeTeam]) records[m.homeTeam] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
    if (!records[m.awayTeam]) records[m.awayTeam] = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
    records[m.homeTeam].played++; records[m.awayTeam].played++;
    records[m.homeTeam].gf += m.homeScore; records[m.homeTeam].ga += m.awayScore;
    records[m.awayTeam].gf += m.awayScore; records[m.awayTeam].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { records[m.homeTeam].won++; records[m.awayTeam].lost++; }
    else if (m.awayScore > m.homeScore) { records[m.awayTeam].won++; records[m.homeTeam].lost++; }
    else { records[m.homeTeam].drawn++; records[m.awayTeam].drawn++; }
  }
  const epMap = {};
  tableData.forEach(r => { epMap[r.team] = r.ep || 0; });
  const table = Object.entries(records).map(([team, r]) => {
    const gd = r.gf - r.ga;
    const pts = r.won * 3 + r.drawn * 1 + (epMap[team] || 0);
    return { team, ...r, gd, pts };
  });
  table.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  table.forEach((row, i) => { row.pos = i + 1; });
  return table;
}

function findTeamPos(standings, teamSlug) {
  const row = standings.find(s => {
    const fromTable = tableData.find(t => t.slug === teamSlug);
    return fromTable && s.team === fromTable.team;
  });
  return row ? row.pos : null;
}

function findTeamInStandings(standings, teamSlug) {
  const fromTable = tableData.find(t => t.slug === teamSlug);
  return standings.find(s => fromTable && s.team === fromTable.team) || null;
}

function winMargin(hs, as) { return hs - as; }

function describeWin(margin) {
  if (margin >= 5) return { adj: "demolished", emphatic: true, close: false };
  if (margin >= 3) return { adj: "dominated", emphatic: true, close: false };
  if (margin >= 2) return { adj: "defeated", emphatic: false, close: false };
  return { adj: "edged past", emphatic: false, close: true };
}

function describeGC(gc1Type, gc2Type, gc1Goals, gc2Goals) {
  const total = gc1Goals + gc2Goals;
  let intro;
  if (total >= 7) intro = "The Game Changer period exploded with";
  else if (total >= 5) intro = "The Game Changer period erupted into life with";
  else if (total >= 2) intro = "The Game Changer brought";
  else if (total === 0) intro = "The Game Changer period passed quietly without";
  else intro = "The Game Changer period saw";

  if (total > 0) {
    return `${intro} ${total} goals across both activations. ${gc1Goals > 0 ? `The 1st half ${gc1Type} produced ${gc1Goals} goal${gc1Goals > 1 ? "s" : ""}. ` : ""}${gc2Goals > 0 ? `${thePrefix(gc2Type, true)}${gc2Type} added ${gc2Goals} more in the 2nd half.` : ""}`.trim();
  }
  return `${intro} a single goal being scored.`;
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

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return "th";
  const mod = n % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

function formString(form) {
  return form.map(f => f === 'W' ? '✅' : f === 'L' ? '❌' : '🤝').join(' ');
}

function formStringText(form) {
  return form.join('-');
}

// ─── Report Generator ─────────────────────────────────────────

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

  // Pre-match context
  const standingsBefore = computeStandings(gw);
  const homePosBefore = findTeamPos(standingsBefore, match.homeSlug);
  const awayPosBefore = findTeamPos(standingsBefore, match.awaySlug);

  // Form (before this GW)
  const homeForm = getTeamForm(match.homeSlug, gw);
  const awayForm = getTeamForm(match.awaySlug, gw);

  // Standings after this GW (for table impact)
  const standingsAfter = computeStandings(gw + 1);
  const homePosAfter = findTeamPos(standingsAfter, match.homeSlug);
  const awayPosAfter = findTeamPos(standingsAfter, match.awaySlug);

  // Head-to-head
  const h2h = getH2H(match.homeSlug, match.awaySlug, gw);

  // Scorers
  const homeScorers = getTopScorers(match.homeSlug);
  const awayScorers = getTopScorers(match.awaySlug);
  const homeScorer = homeScorers[0] || null;
  const awayScorer = awayScorers[0] || null;

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

  const excerpt = `${home} ${hs}-${as} ${away} — Gameweek ${gw} match report. ` +
    (homeScorer ? `${homeScorer.name} (${homeScorer.seasons?.["3"]?.goals || 0} goals) leads ${home}'s attack. ` : "") +
    `Game Changers: ${gc1} (${gc1g}) & ${gc2} (${gc2g}). ` +
    `Read the full match report, player stats and table impact.`;

  const date = new Date();
  const dateStr = date.toISOString().split("T")[0];

  // Build player stats table
  function playerTable(scorers, teamName, teamSlug) {
    if (scorers.length === 0) return `No goalscorers recorded for ${teamName} this season.`;
    let t = `| Player | Goals | Assists | Apps |\n|--------|-------|---------|------|\n`;
    for (const p of scorers) {
      const s = p.seasons?.["3"] || {};
      t += `| ${p.name} | ${s.goals || 0} | ${s.assists || 0} | ${s.appearances || 0} |\n`;
    }
    return t;
  }

  // Build table impact paragraph
  function tableImpactText(team, teamSlug, oldPos, newPos) {
    if (oldPos === null || newPos === null) return `${team}'s league position was unaffected.`;
    if (newPos < oldPos) return `${team} climbed from ${oldPos}${ordinalSuffix(oldPos)} to ${newPos}${ordinalSuffix(newPos)} in the table.`;
    if (newPos > oldPos) return `${team} slipped from ${oldPos}${ordinalSuffix(oldPos)} to ${newPos}${ordinalSuffix(newPos)}.`;
    return `${team} stay ${newPos}${ordinalSuffix(newPos)} in the standings.`;
  }

  // Build h2h text
  function h2hText() {
    if (h2h.played === 0) return `This was the first ever meeting between ${home} and ${away}.`;
    return `${home} and ${away} had met ${h2h.played} time${h2h.played > 1 ? 's' : ''} before. ${home} won ${h2h.won}, ${away} won ${h2h.lost}, with ${h2h.drawn} draw${h2h.drawn !== 1 ? 's' : ''}.`;
  }

  const content = `---
title: "${title}"
date: ${dateStr}
category: "Match Report"
excerpt: "${excerpt}"
author: "Baller League UK Fan Site"
featured: ${hs + as >= 10}
---

## Match Summary — ${home} ${hs}-${as} ${away}

${winner
    ? `${winner} ${desc.adj} ${loser} ${hs}-${as} at Baller Arena in Gameweek ${gw}${desc.emphatic ? " in an emphatic display" : desc.close ? " in a tight contest" : ""}. `
    : `${home} and ${away} played out an entertaining ${hs}-${as} draw at Baller Arena. `
}${homePosBefore ? `${home} came into the match sitting ${homePosBefore}${ordinalSuffix(homePosBefore)} in the table` : ""}${awayPosBefore ? `, while ${away} were ${awayPosBefore}${ordinalSuffix(awayPosBefore)}` : ""}.

${homeForm.length > 0 ? `**${home} form:** ${formString(homeForm)} (${formStringText(homeForm)})  \n` : ""}${awayForm.length > 0 ? `**${away} form:** ${formString(awayForm)} (${formStringText(awayForm)})` : ""}

## First Half

The first half saw the ${gc1} Game Changer activate at the 12th minute${gc1g > 0 ? `, producing ${gc1g} goal${gc1g > 1 ? "s" : ""}` : " but neither side could capitalise"}. ${winner ? `${winner} established control early` : "The sides went into the break level"} with an attacking display that set the tone for the match.

## Second Half

${thePrefix(gc2, true)}${gc2} Game Changer kicked in at the 27th minute${gc2g > 0 ? `, adding ${gc2g} goal${gc2g > 1 ? "s" : ""} to the game` : ", but goals proved hard to come by"}. ${winner ? `${winner} ${desc.close ? "held their nerve to" : "cruised to"} a ${Math.abs(margin)}-goal victory` : `Neither side could find a winner as the match ended all square`}.

## The Game Changer ⚡

${describeGC(gc1, gc2, gc1g, gc2g)}

| GC Activation | Type | Goals |
|---------------|------|-------|
| 1st Half (12') | ${gc1} | ${gc1g} |
| 2nd Half (27') | ${gc2} | ${gc2g} |
| **Total** | | **${gc1g + gc2g}** |

${(gc1g + gc2g) >= 5 ? `The Game Changers proved decisive with a high-scoring ${gc1g + gc2g} goals contributing heavily to the outcome.` : ""}${(gc1g + gc2g) === 0 ? `Neither Game Changer activation produced goals — a rare quiet day for the rule changes.` : ""}

## Key Players

### ${home} — Top Scorers

${playerTable(homeScorers, home, match.homeSlug)}

### ${away} — Top Scorers

${playerTable(awayScorers, away, match.awaySlug)}

${homeScorer ? `**${homeScorer.name}** leads ${home} with ${homeScorer.seasons?.["3"]?.goals || 0} goals in ${homeScorer.seasons?.["3"]?.appearances || 0} appearances this season.` : ""}
${awayScorer ? `  \n**${awayScorer.name}** is ${away}'s top marksman with ${awayScorer.seasons?.["3"]?.goals || 0} goals.` : ""}

## Head-to-Head

${h2hText()}

${h2h.played > 0 ? `| Stat | ${home} | ${away} |
|------|${'-'.repeat(home.length + 2)}|${'-'.repeat(away.length + 2)}|
| Wins | ${h2h.won} | ${h2h.lost} |
| Draws | ${h2h.drawn} | ${h2h.drawn} |
| Goals | ${h2h.gf} | ${h2h.ga} |` : ""}

## Table Impact

${tableImpactText(home, match.homeSlug, homePosBefore, homePosAfter)}
${tableImpactText(away, match.awaySlug, awayPosBefore, awayPosAfter)}

## Match Stats

| | ${home} | ${away} |
|---|${'-'.repeat(home.length)}|${'-'.repeat(away.length)}|
| Goals | ${hs} | ${as} |
| GC Goals | ${gc1g + gc2g} | ${gc1g + gc2g} |

## Talking Points

- This was Gameweek ${gw} at Baller Arena, featuring ${gc1} and ${gc2} Game Changers
- ${winner ? `${winner} took all 3 points${margin >= 3 ? " in dominant fashion" : ""}` : "The points were shared after a closely-fought draw"}
${homeScorer ? `- **${homeScorer.name}** is ${home}'s standout performer with ${homeScorer.seasons?.["3"]?.goals || 0} goals` : ""}
${awayScorer ? `- **${awayScorer.name}** continues to lead the line for ${away} with ${awayScorer.seasons?.["3"]?.goals || 0} goals` : ""}
- ${gc1g + gc2g} goals came from Game Changer activations
${margin >= 5 ? `- This was ${winner}'s biggest winning margin of the season` : ""}
${hs + as >= 10 ? `- A high-scoring thriller with ${hs + as} total goals` : ""}
${hs + as <= 2 ? `- A tight defensive battle with just ${hs + as} goal${hs + as !== 1 ? 's' : ''} scored` : ""}

## What's Next

${homeNext ? `${home} face ${homeNext.homeTeam === home ? homeNext.awayTeam : homeNext.homeTeam} in Gameweek ${homeNext.gameweek}.` : `${home} await their next fixture.`}
${awayNext ? `  \n${away} take on ${awayNext.homeTeam === away ? awayNext.awayTeam : awayNext.homeTeam} in Gameweek ${awayNext.gameweek}.` : `  \n${away} await their next fixture.`}

---

*All stats via [Baller League UK Hub](https://ballerleagueukhub.com). Match reports auto-generated from official data.*
`;

  return { slug, content };
}

// ─── Main ──────────────────────────────────────────────────────

console.log(`Generating match reports for ${matches.length} matches (Season ${targetSeason || "all"})...\n`);

let generated = 0;
const seen = new Set();

for (const match of matches) {
  const { slug, content } = generateReport(match);
  if (seen.has(slug)) continue;
  seen.add(slug);
  const filePath = resolve(CONTENT_DIR, `${slug}.md`);
  writeFileSync(filePath, content);
  generated++;
  console.log(`  ${slug}.md`);
}

console.log(`\nDone! ${generated} match reports generated in ${CONTENT_DIR}`);
