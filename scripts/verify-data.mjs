import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const gc = read("src/data/gamechangers.json");
const players = read("src/data/players.json").players;
// Official final tables per season, captured by scripts/scrape-standings.mjs.
const standings = read("src/data/standings.json");

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`  \u2705 ${msg}`);
const bad = (msg) => { failures++; console.log(`  \u274c ${msg}`); };
const warn = (msg) => { warnings++; console.log(`  \u26a0\ufe0f  ${msg}`); };

// Recompute a season's league standings (regular season only, GW <= 11) from match data.
function computeStandings(seasonMatches, epBySlug) {
  const rec = {};
  for (const m of seasonMatches) {
    if (m.gameweek > 11) continue;
    if (m.homeScore === 0 && m.awayScore === 0) continue;
    for (const [slug, gf, ga] of [
      [m.homeSlug, m.homeScore, m.awayScore],
      [m.awaySlug, m.awayScore, m.homeScore],
    ]) {
      if (!rec[slug]) rec[slug] = { slug, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
      const r = rec[slug];
      r.played++;
      r.gf += gf;
      r.ga += ga;
      if (gf > ga) r.won++;
      else if (gf < ga) r.lost++;
      else r.drawn++;
    }
  }
  const rows = Object.values(rec).map((r) => {
    const ep = epBySlug[r.slug] || 0;
    return { ...r, gd: r.gf - r.ga, ep, pts: r.won * 3 + r.drawn + ep };
  });
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  rows.forEach((r, i) => { r.position = i + 1; });
  return rows;
}

function checkStructural(matches) {
  const teams = new Set();
  const perGW = {};
  for (const m of matches) {
    teams.add(m.homeSlug);
    teams.add(m.awaySlug);
    perGW[m.gameweek] = (perGW[m.gameweek] || 0) + 1;
  }
  const gwStr = Object.keys(perGW).sort((a, b) => a - b).map((g) => `${g}:${perGW[g]}`).join(" ");
  console.log(`  matches=${matches.length} teams=${teams.size} | per-GW ${gwStr}`);
  const badGW = Object.entries(perGW).filter(([g, n]) => Number(g) <= 11 && n !== 6);
  if (badGW.length) bad(`irregular gameweeks (expected 6 each): ${badGW.map(([g, n]) => `GW${g}=${n}`).join(", ")}`);
  else ok("all regular gameweeks have 6 matches");
}

function checkInternal(matches) {
  let gsOk = 0, psOk = 0, gsBad = 0, psBad = 0;
  for (const m of matches) {
    const total = m.homeScore + m.awayScore;
    if (!total) continue;
    const gs = (m.goalscorers || []).length;
    const ps = (m.playerStats || []).reduce((s, p) => s + (p.goals || 0), 0);
    if (gs === total) gsOk++; else gsBad++;
    if (ps === total) psOk++; else psBad++;
  }
  console.log(`  goalscorers sum == score: ${gsOk} ok / ${gsBad} mismatch`);
  console.log(`  playerStats goals == score: ${psOk} ok / ${psBad} mismatch`);
  if (gsBad) warn(`${gsBad} matches have goalscorer counts != score (own goals / parse gaps)`);
  if (psBad) warn(`${psBad} matches have playerStats goals != score`);
}

function checkStandings(ours, official) {
  const offBySlug = Object.fromEntries(official.map((r) => [r.slug, r]));
  const ourBySlug = Object.fromEntries(ours.map((r) => [r.slug, r]));

  const missing = official.filter((o) => !ourBySlug[o.slug]);
  const extra = ours.filter((o) => !offBySlug[o.slug]);
  if (missing.length) bad(`teams missing from our data: ${missing.map((m) => `${m.team} (${m.slug})`).join(", ")}`);
  if (extra.length) bad(`teams in our data not in official: ${extra.map((m) => m.slug).join(", ")}`);

  const fields = ["played", "won", "drawn", "lost", "gd", "ep", "pts"];
  let mismatches = 0;
  for (const o of official) {
    const u = ourBySlug[o.slug];
    if (!u) continue;
    const diffs = fields.filter((f) => u[f] !== o[f]);
    if (diffs.length) {
      mismatches++;
      bad(`${o.team.padEnd(16)} ${diffs.map((f) => `${f}: ours=${u[f]} official=${o[f]}`).join("  ")}`);
    }
  }
  if (!mismatches && !missing.length && !extra.length) ok(`standings match official exactly (${official.length} teams)`);
}

function checkPlayers() {
  const s3 = gc.seasons["3"].matches;
  const tally = {};
  for (const m of s3) for (const g of m.goalscorers || []) tally[g.player] = (tally[g.player] || 0) + 1;
  let checked = 0, diffs = 0;
  for (const p of players) {
    const pj = (p.seasons["3"] || {}).goals || 0;
    const tl = tally[p.name] || 0;
    if (pj !== tl) diffs++;
    checked++;
  }
  console.log(`  players.json goals vs match-timeline goals: ${checked - diffs}/${checked} agree`);
  if (diffs) warn(`${diffs} players disagree — players.json likely stale or mis-parsed (official leaderboard follows the match timeline)`);
}

function main() {
  const wanted = process.argv.slice(2).filter((a) => ["1", "2", "3"].includes(a));
  const seasons = wanted.length ? wanted : ["1", "2", "3"];

  console.log("Baller League UK — data verification vs official (src/data/standings.json)\n");

  for (const s of seasons) {
    const matches = (gc.seasons[s] || { matches: [] }).matches;
    const official = standings[s] || [];
    const epBySlug = Object.fromEntries(official.map((r) => [r.slug, r.ep || 0]));
    console.log(`\n===== Season ${s} =====`);
    checkStructural(matches);
    checkInternal(matches);
    checkStandings(computeStandings(matches, epBySlug), official);
  }

  console.log(`\n===== Players =====`);
  checkPlayers();

  console.log(`\n${failures === 0 ? "\u2705 PASS" : `\u274c FAIL (${failures} issue${failures === 1 ? "" : "s"})`}${warnings ? `  |  ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`);
  process.exit(failures ? 1 : 0);
}

main();
