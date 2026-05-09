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
  .filter(m => m.homeScore > 0 || m.awayScore > 0);

const players = playerData.players;
const upcoming = fixturesData.upcoming;

function getTopScorer(teamSlug) {
  const squad = players.filter(p => p.teamSlug === teamSlug && (p.seasons?.["3"]?.goals || 0) > 0);
  squad.sort((a, b) => (b.seasons?.["3"]?.goals || 0) - (a.seasons?.["3"]?.goals || 0));
  return squad[0] || null;
}

function getTeamPosition(slug) { const t = tableData.find(r => r.slug === slug); return t ? t.pos : null; }

function getForm(slug) {
  const teamMatches = allMatches
    .filter(m => (m.homeSlug === slug || m.awaySlug === slug))
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, 5);
  return teamMatches.map(m => {
    const isHome = m.homeSlug === slug;
    const gd = isHome ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
    if (gd > 0) return "W";
    if (gd < 0) return "L";
    return "D";
  });
}

function getH2H(t1, t2) {
  return allMatches.filter(m =>
    (m.homeSlug === t1 && m.awaySlug === t2) || (m.homeSlug === t2 && m.awaySlug === t1)
  );
}

function getTeamGCStats(slug) {
  const matches = allMatches.filter(m => m.homeSlug === slug || m.awaySlug === slug);
  let totalGC = 0;
  let count = 0;
  for (const m of matches) {
    totalGC += (m.gamechanger1?.goalsScored || 0) + (m.gamechanger2?.goalsScored || 0);
    count++;
  }
  return { avg: count > 0 ? (totalGC / count).toFixed(1) : "0.0", total: totalGC };
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return "th";
  const mod = n % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

function generatePreview(fixture) {
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const hSlug = fixture.homeSlug;
  const aSlug = fixture.awaySlug;
  const gw = fixture.gameweek;

  const homePos = getTeamPosition(hSlug);
  const awayPos = getTeamPosition(aSlug);
  const homeForm = getForm(hSlug);
  const awayForm = getForm(aSlug);
  const hScorer = getTopScorer(hSlug);
  const aScorer = getTopScorer(aSlug);
  const hH2H = getH2H(hSlug, aSlug);
  const hGC = getTeamGCStats(hSlug);
  const aGC = getTeamGCStats(aSlug);

  const h2hRecord = getRecord(hH2H, home);
  const h2hLast = hH2H.length > 0 ? hH2H[0] : null;

  const slug = `${hSlug}-vs-${aSlug}-gw${gw}-preview`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const date = new Date().toISOString().split("T")[0];

  const title = `Gameweek ${gw} Preview: ${home} vs ${away}`;

  const excerpt = `${home} (${homePos || "?"}${ordinalSuffix(homePos || 0)}) host ${away} (${awayPos || "?"}${ordinalSuffix(awayPos || 0)}) in Gameweek ${gw}. ${hScorer ? `${hScorer.name} (${hScorer.seasons?.["3"]?.goals || 0} goals) leads ${home}.` : ""}`;

  const formBadge = (l) => l;

  const content = `---
title: "${title}"
date: ${date}
category: "Preview"
excerpt: "${excerpt}"
author: "Baller League UK Fan Site"
featured: false
---

## ${home} vs ${away} — Gameweek ${gw} Preview

${home} (${homePos}${ordinalSuffix(homePos || 0)} in the table) host ${away} (${awayPos}${ordinalSuffix(awayPos || 0)}) at Baller Arena in Gameweek ${gw}. 
${homePos && awayPos && homePos < awayPos
    ? `${home} come into this fixture above ${away} in the standings and will look to extend that advantage.`
    : homePos && awayPos
    ? `${away} sit above ${home} in the table and will aim to maintain their position.`
    : "Both teams will be eager to claim a crucial three points."}

## Form Guide

**${home}**: ${homeForm.map(l => formBadge(l)).join(" - ")} (last ${homeForm.length} matches)
**${away}**: ${awayForm.map(l => formBadge(l)).join(" - ")} (last ${awayForm.length} matches)

## Head-to-Head

${hH2H.length > 0
    ? `These sides have met ${hH2H.length} time${hH2H.length > 1 ? "s" : ""} before. ${home} have won ${h2hRecord.w}, ${away} have won ${h2hRecord.l}, with ${h2hRecord.d} draw${h2hRecord.d !== 1 ? "s" : ""}.`
    : "These sides have yet to meet in Baller League competition — this will be their first encounter!"}
${h2hLast ? `The last meeting saw ${h2hLast.homeTeam} defeat ${h2hLast.awayTeam} ${h2hLast.homeScore}-${h2hLast.awayScore}.` : ""}

## Key Players

${hScorer ? `**${hScorer.name}** — ${home}'s top scorer with ${hScorer.seasons?.["3"]?.goals || 0} goals and ${hScorer.seasons?.["3"]?.assists || 0} assists this season${hScorer.position ? ` (${hScorer.position})` : ""}.` : ""}
${aScorer ? `**${aScorer.name}** — leads ${away}'s attack with ${aScorer.seasons?.["3"]?.goals || 0} goals in ${aScorer.seasons?.["3"]?.apps || 0} appearances.` : ""}

## Game Changer X-Factor

${home} average **${hGC.avg}** goals per match during Game Changer periods (${hGC.total} total).
${away} average **${aGC.avg}** GC goals per match (${aGC.total} total).

## Prediction

${homePos && awayPos && homePos < awayPos
    ? `Based on current form and league position, ${home} go into this match as slight favourites, but ${away} have the quality to cause an upset.`
    : awayPos && homePos && awayPos < homePos
    ? `${away} hold the upper hand on paper, but ${home} will be dangerous on home turf.`
    : "This is a closely matched contest on paper. Expect goals, drama, and the Game Changer to play a decisive role."}
`;

  return { slug, content };
}

function getRecord(matches, team) {
  let w = 0, d = 0, l = 0;
  for (const m of matches) {
    const gd = m.homeSlug === team ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
    if (gd > 0) w++; else if (gd < 0) l++; else d++;
  }
  return { w, d, l };
}

console.log(`Generating previews for ${upcoming.length} upcoming fixtures...\n`);

let generated = 0;
for (const fixture of upcoming) {
  const { slug, content } = generatePreview(fixture);
  const filePath = resolve(CONTENT_DIR, `${slug}.md`);
  writeFileSync(filePath, content);
  generated++;
  console.log(`  ${slug}.md`);
}

console.log(`\nDone! ${generated} previews generated.`);
