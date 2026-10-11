import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = resolve(ROOT, "src", "content", "news");

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const gcData = read("src/data/gamechangers.json");
const tableData = read("src/data/table.json");
const standings = read("src/data/standings.json");
const playerData = read("src/data/players.json");
const fixturesData = read("src/data/fixtures.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const CURRENT_SEASON = fixturesData.upcoming[0]?.season ?? 4;
const players = playerData.players;
const nameToSlug = Object.fromEntries(players.map((p) => [p.name.toLowerCase(), p.slug]));

const allMatches = [];
for (const [season, data] of Object.entries(gcData.seasons)) {
  for (const m of data.matches) {
    if (m.homeScore > 0 || m.awayScore > 0) allMatches.push({ ...m, season: Number(season) });
  }
}
const seasonsPlayed = [...new Set(allMatches.map((m) => m.season))].sort((a, b) => a - b);

function ordinal(n) {
  if (n > 3 && n < 21) return "th";
  const m = n % 10;
  return m === 1 ? "st" : m === 2 ? "nd" : m === 3 ? "rd" : "th";
}

function buildHistory(slug) {
  const team = tableData.find((t) => t.slug === slug);
  const name = team?.team || slug;

  const matches = allMatches.filter((m) => m.homeSlug === slug || m.awaySlug === slug);
  let won = 0, drawn = 0, lost = 0, gf = 0, ga = 0;
  for (const m of matches) {
    const isHome = m.homeSlug === slug;
    const s = isHome ? m.homeScore : m.awayScore;
    const c = isHome ? m.awayScore : m.homeScore;
    gf += s; ga += c;
    if (s > c) won++; else if (s < c) lost++; else drawn++;
  }
  const played = matches.length;
  const gd = gf - ga;
  const winPct = played ? Math.round((won / played) * 100) : 0;

  // Season-by-season record from the official standings.
  const seasonRows = [];
  for (const s of seasonsPlayed) {
    const row = (standings[String(s)] || []).find((r) => r.slug === slug);
    if (row) seasonRows.push({ season: s, ...row });
  }

  // All-time top scorers attributable to this club (from per-match player stats).
  const tally = {};
  for (const m of matches) {
    for (const p of m.playerStats || []) {
      if (p.team !== slug) continue;
      if (!tally[p.name]) tally[p.name] = { goals: 0, assists: 0, apps: 0 };
      tally[p.name].goals += p.goals || 0;
      tally[p.name].assists += p.assists || 0;
      tally[p.name].apps += 1;
    }
  }
  const topScorers = Object.entries(tally).sort((a, b) => b[1].goals - a[1].goals).slice(0, 5);

  // Notable results.
  let biggestWin = null, topGame = null;
  for (const m of matches) {
    const isHome = m.homeSlug === slug;
    const s = isHome ? m.homeScore : m.awayScore;
    const c = isHome ? m.awayScore : m.homeScore;
    const margin = s - c;
    if (!biggestWin || margin > biggestWin.margin) biggestWin = { margin, s, c, m, isHome };
    const total = m.homeScore + m.awayScore;
    if (!topGame || total > topGame.total) topGame = { total, m };
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const title = `${name} — Baller League UK All-Time Record & History`;
  const excerpt = `${name} in numbers: their all-time Baller League UK record, season-by-season finishes, top scorers and standout results across every season.`;

  let s = `---\ntitle: "${title}"\ndate: ${dateStr}\ncategory: "Feature"\nexcerpt: "${excerpt.replace(/"/g, "'")}"\nauthor: "Baller League UK Hub"\nfeatured: false\n---\n\n`;
  s += `## ${name}: All-Time Baller League UK Record\n\n`;
  s += `**${name}** have played **${played}** matches in Baller League UK across ${seasonsPlayed.length} seasons, winning **${won}**, drawing **${drawn}** and losing **${lost}** — a win rate of **${winPct}%**. They have scored **${gf}** goals and conceded **${ga}** (goal difference **${gd >= 0 ? "+" : ""}${gd}**).\n\n`;

  s += `## Season-by-season\n\n`;
  if (seasonRows.length) {
    s += `| Season | Pos | Pld | W | D | L | GD | Pts |\n|--------|-----|-----|---|---|---|----|-----|\n`;
    for (const r of seasonRows) {
      s += `| ${r.season} | ${r.pos}${ordinal(r.pos)} | ${r.played} | ${r.won} | ${r.drawn} | ${r.lost} | ${r.gd >= 0 ? "+" : ""}${r.gd} | ${r.pts} |\n`;
    }
    s += `\n`;
    const best = [...seasonRows].sort((a, b) => a.pos - b.pos)[0];
    s += `Their best finish came in **Season ${best.season}**, finishing **${best.pos}${ordinal(best.pos)}** on **${best.pts} points**.\n\n`;
  } else {
    s += `${name} are yet to complete a season in the competition.\n\n`;
  }

  if (topScorers.length) {
    s += `## Top scorers (all-time club)\n\n`;
    for (const [player, st] of topScorers) {
      const slugP = nameToSlug[player.toLowerCase()];
      const label = slugP ? `[${player}](/players/${slugP})` : player;
      s += `- **${label}** — ${st.goals} goals, ${st.assists} assists\n`;
    }
    s += `\n`;
  }

  if (biggestWin && biggestWin.margin > 0) {
    const m = biggestWin.m;
    const opp = biggestWin.isHome ? m.awayTeam : m.homeTeam;
    s += `## Biggest win\n\n`;
    s += `${name}'s biggest win was a **${biggestWin.s}-${biggestWin.c}** victory over **${opp}** (Season ${m.season}).\n\n`;
  }
  if (topGame) {
    const m = topGame.m;
    s += `## Highest-scoring game\n\n`;
    s += `The most goals ${name} have been involved in was a **${topGame.total}-goal** thriller: **${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}** (Season ${m.season}).\n\n`;
  }

  s += `## Follow ${name}\n\n`;
  s += `See the current squad and this season's fixtures on the [${name} team page](/teams/${slug}), and keep up with standings on the live [league table](/table). For the full history of the competition, head to the [seasons archive](/season) and our [all-time records](/news/baller-league-uk-records-all-time-stats).\n`;

  return { slug: `baller-league-team-history-${slug}`, content: s };
}

const teams = tableData.map((t) => t.slug);
console.log(`Generating ${teams.length} club history pages...\n`);
let n = 0;
for (const slug of teams) {
  const { slug: file, content } = buildHistory(slug);
  writeFileSync(resolve(CONTENT_DIR, `${file}.md`), content);
  console.log(`  ${file}.md`);
  n++;
}
console.log(`\nDone! ${n} club history pages generated.`);
