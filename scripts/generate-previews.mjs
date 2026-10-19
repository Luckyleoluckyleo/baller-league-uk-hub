import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = resolve(ROOT, "src", "content", "news");

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const gcData = read("src/data/gamechangers.json");
const playerData = read("src/data/players.json");
const tableData = read("src/data/table.json");
const fixturesData = read("src/data/fixtures.json");
const season4 = read("src/data/season4.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const players = playerData.players;
const upcoming = fixturesData.upcoming;
// Keep the season on every match: gameweek numbers repeat each season, so
// ordering by gameweek alone mixes S3 GW12 into an S4 GW2 form guide.
const allMatches = Object.entries(gcData.seasons)
  .flatMap(([season, s]) =>
    s.matches
      .filter((m) => m.homeScore > 0 || m.awayScore > 0)
      .map((m) => ({ ...m, season: Number(season) }))
  );

// Map each game to its season so historical references read correctly.
const seasonOfGame = {};
for (const [s, data] of Object.entries(gcData.seasons)) for (const m of data.matches) seasonOfGame[m.gameId] = s;

// ─── Season context ────────────────────────────────────────────
const CURRENT_SEASON = upcoming[0]?.season ?? Math.max(...Object.keys(gcData.seasons).map(Number));
const currentMatches = (gcData.seasons[String(CURRENT_SEASON)]?.matches || []).filter((m) => m.homeScore > 0 || m.awayScore > 0);
const preSeason = currentMatches.length === 0;
// The most recent season that actually has results (used for "last season" context).
const statsSeason = String(
  Object.keys(gcData.seasons)
    .map(Number)
    .sort((a, b) => b - a)
    .find((s) => (gcData.seasons[String(s)]?.matches || []).some((m) => m.homeScore > 0 || m.awayScore > 0)) ?? CURRENT_SEASON - 1
);

const teamByName = Object.fromEntries(tableData.map((t) => [t.slug, t]));
const managerFor = (slug) => (season4.managers || []).find((m) => m.teamSlug === slug);
const changeFor = (slug) => (season4.teamChanges || []).find((c) => (c.team || "").toLowerCase() === (teamByName[slug]?.team || "").toLowerCase());

const seasonLabel = `Season ${CURRENT_SEASON}`;
const formLabel = preSeason ? `last season (Season ${statsSeason})` : `this season`;

function ordinal(n) {
  if (n > 3 && n < 21) return "th";
  const m = n % 10;
  return m === 1 ? "st" : m === 2 ? "nd" : m === 3 ? "rd" : "th";
}

function keyPlayers(slug, limit = 5) {
  return players
    .filter((p) => p.teamSlug === slug && (p.seasons?.[statsSeason]?.apps || 0) > 0)
    .sort((a, b) => (b.seasons?.[statsSeason]?.goals || 0) - (a.seasons?.[statsSeason]?.goals || 0))
    .slice(0, limit);
}

function teamForm(slug) {
  return allMatches
    .filter((m) => m.season === Number(statsSeason) && (m.homeSlug === slug || m.awaySlug === slug))
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, 5)
    .map((m) => {
      const isHome = m.homeSlug === slug;
      const gd = isHome ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
      return gd > 0 ? "W" : gd < 0 ? "L" : "D";
    });
}

function h2h(a, b) {
  const ms = allMatches
    .filter((m) => (m.homeSlug === a && m.awaySlug === b) || (m.homeSlug === b && m.awaySlug === a))
    .sort((x, y) => (x.season - y.season) || (x.gameweek - y.gameweek));
  let aw = 0, bw = 0, dr = 0;
  for (const m of ms) {
    const aIsHome = m.homeSlug === a;
    const aGoals = aIsHome ? m.homeScore : m.awayScore;
    const bGoals = aIsHome ? m.awayScore : m.homeScore;
    if (aGoals > bGoals) aw++;
    else if (bGoals > aGoals) bw++;
    else dr++;
  }
  return { played: ms.length, aw, bw, dr, last: ms[ms.length - 1] || null };
}

// Use a single completed season so the average is comparable. During pre-season
// that is the latest played season; once the new season starts it is the one before.
const gcSeason = preSeason ? Number(statsSeason) : CURRENT_SEASON - 1;

function gcRate(slug) {
  const ms = allMatches.filter((m) => m.season === gcSeason && (m.homeSlug === slug || m.awaySlug === slug));
  const total = ms.reduce((s, m) => s + (m.gamechanger1?.goalsScored || 0) + (m.gamechanger2?.goalsScored || 0), 0);
  return { total, avg: ms.length ? (total / ms.length).toFixed(1) : "0.0" };
}

function playerLine(p) {
  const st = p.seasons?.[statsSeason] || {};
  return `- **${p.name}**${p.position ? ` (${p.position})` : ""} — ${st.goals || 0} goals, ${st.assists || 0} assists in ${st.apps || 0} appearance${st.apps === 1 ? "" : "s"} in Season ${statsSeason}.`;
}

function teamSection(slug, teamName) {
  const mgr = managerFor(slug);
  const change = changeFor(slug);
  const players = keyPlayers(slug);

  let s = `### ${teamName}\n\n`;
  if (mgr) {
    s += `Managed by **${mgr.name}**${change?.status === "confirmed" && change.note ? `. ${change.note}` : ""}\n\n`;
  }
  if (players.length) {
    s += `**Ones to watch**\n\n${players.map(playerLine).join("\n")}\n\n`;
  } else {
    s += `Squad details for ${teamName} are still being confirmed ahead of the new season.\n\n`;
  }
  return s;
}

function buildPreview(fixture) {
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const hSlug = fixture.homeSlug;
  const aSlug = fixture.awaySlug;
  const gw = fixture.gameweek;

  const homeMgr = managerFor(hSlug);
  const awayMgr = managerFor(aSlug);
  const homeForm = teamForm(hSlug);
  const awayForm = teamForm(aSlug);
  const head = h2h(hSlug, aSlug);
  const hGC = gcRate(hSlug);
  const aGC = gcRate(aSlug);
  const dateStr = fixture.date || "";
  const timeStr = fixture.time || "";

  const slug = `${hSlug}-vs-${aSlug}-gw${gw}-preview`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const iso = new Date().toISOString().split("T")[0];

  const title = `Gameweek ${gw} Preview: ${home} vs ${away} — Team News, Key Players & Prediction`;
  const excerpt = `${home} meet ${away} in Gameweek ${gw} of Baller League UK ${seasonLabel}${dateStr ? ` on ${dateStr}` : ""}${timeStr ? ` (${timeStr})` : ""}. Team news, key players, head-to-head and our prediction.`;

  const intro = preSeason || gw === 1
    ? `The new Baller League UK season gets under way as **${home}** take on **${away}** in Gameweek ${gw}${dateStr ? ` on **${dateStr}**` : ""}${timeStr ? `, with kick-off at **${timeStr}**` : ""}. It is the first competitive outing of ${seasonLabel} for both clubs, and the opening night at the Baller League Arena in Dagenham promises the usual mix of fast 6v6 football, celebrity dugouts and the game-changing rule twists that make the league so watchable.`
    : `**${home}** host **${away}** in Gameweek ${gw} of Baller League UK ${seasonLabel}${dateStr ? ` on **${dateStr}**` : ""}${timeStr ? `, with kick-off at **${timeStr}**` : ""}. Both sides are looking to build momentum at the Baller League Arena in Dagenham, with the usual mix of fast 6v6 football, celebrity dugouts and the game-changing rule twists that make the league so watchable.`;

  const contextPara = preSeason
    ? `Season ${CURRENT_SEASON} marks a fresh start. Yanited have been rebranded as **RTG FC**, Rukkas FC are now **P17 FC**, and **Toma** join the league as a brand-new franchise — but the format remains the same: 12 teams, 11 Monday-night matchdays and a Final Four deciding the champion.`
    : `Every point matters in ${seasonLabel}. With the top four reaching the Final Four at the end of the regular season, ${home} and ${away} both know this is a chance to climb the table.`;

  let formSection = "";
  if (homeForm.length || awayForm.length) {
    formSection += `\n## Form Guide\n\n`;
    formSection += `Here is how the two sides finished up ${formLabel}, most recent result first (W = win, D = draw, L = loss):\n\n`;
    formSection += `- **${home}:** ${homeForm.length ? homeForm.join(" · ") : "—"}\n`;
    formSection += `- **${away}:** ${awayForm.length ? awayForm.join(" · ") : "—"}\n`;
  }

  let h2hSection = `\n## Head-to-Head\n\n`;
  if (head.played === 0) {
    h2hSection += `**${home}** and **${away}** have never met in Baller League UK — Gameweek ${gw} will be their first-ever competitive encounter.\n`;
  } else {
    h2hSection += `${home} and ${away} have met **${head.played}** time${head.played > 1 ? "s" : ""} before. ${home} have won **${head.aw}**, ${away} have won **${head.bw}**, with **${head.dr}** draw${head.dr === 1 ? "" : "s"}.\n`;
    if (head.last) {
      const lastSeason = seasonOfGame[head.last.gameId];
      h2hSection += `\nThe most recent meeting came in Gameweek ${head.last.gameweek}${lastSeason ? ` of Season ${lastSeason}` : ""}, when the match finished **${head.last.homeTeam} ${head.last.homeScore}-${head.last.awayScore} ${head.last.awayTeam}**.\n`;
    }
  }

  const gcSection = `\n## Game Changer Watch\n\n`
    + `Both teams will need to be ready for the rule changes that arrive at the 12th and 27th minutes. Last season, **${home}** averaged **${hGC.avg}** Game Changer goals per match (${hGC.total} in total), while **${away}** averaged **${aGC.avg}** (${aGC.total}). `;

  const managerSection = (homeMgr || awayMgr)
    ? `\n## The Dugouts\n\n`
      + (homeMgr ? `**${home}** are led by **${homeMgr.name}**.\n\n` : "")
      + (awayMgr ? `**${away}** are led by **${awayMgr.name}**.\n\n` : "")
      + `The manager battle on the touchline — and the personalities involved — is half the fun in the Baller League.\n`
    : "";

  const prediction = preSeason
    ? `With no competitive form to go on yet, this one is genuinely hard to call. Both squads have been reshaped over the summer, and the opening night of a new season is notorious for surprises. Expect goals, a loud crowd and at least one Game Changer turning the game on its head.`
    : `On recent evidence there is little to separate them. We are backing a tight, high-scoring contest in which the Game Changer windows — and whichever forward takes his chances — decide the outcome.`;

  const howToWatch = `Matches stream online for ${seasonLabel} after the league's move away from traditional broadcast. Check our [where to watch guide](/watch) for the latest ways to follow every gameweek, and bookmark the [live table](/table) for results as they happen.`;

  const content = `---
title: "${title}"
date: ${iso}
category: "Preview"
excerpt: "${excerpt.replace(/"/g, "'")}"
author: "Baller League UK Hub"
featured: false
---

## ${home} vs ${away} — Gameweek ${gw} Preview

${intro}

${contextPara}

## Team News

${teamSection(hSlug, home)}
${teamSection(aSlug, away)}
${managerSection}${formSection}${h2hSection}${gcSection}

## Prediction

${prediction}

## How to Watch

${howToWatch}

---

*Preview published by [Baller League UK Hub](https://ballerleagueukhub.com) — the unofficial fan hub for Baller League UK ${seasonLabel}.*

*Follow the new season with our [Season ${CURRENT_SEASON} hub](/season-4), the [full league table](/table) and [every team's squad](/teams).*
`;

  return { slug, content };
}

console.log(`Generating previews for ${upcoming.length} upcoming fixtures (${seasonLabel})...\n`);
let generated = 0;
for (const fixture of upcoming) {
  const { slug, content } = buildPreview(fixture);
  writeFileSync(resolve(CONTENT_DIR, `${slug}.md`), content);
  generated++;
  console.log(`  ${slug}.md`);
}
console.log(`\nDone! ${generated} previews generated.`);
