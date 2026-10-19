import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FIXTURES_PATH = resolve(ROOT, "src", "data", "fixtures.json");
const TABLE_PATH = resolve(ROOT, "src", "data", "table.json");
const SEASON4_PATH = resolve(ROOT, "src", "data", "season4.json");
const GAMECHANGERS_PATH = resolve(ROOT, "src", "data", "gamechangers.json");

const SITE = "https://ballerleague.uk";
const MATCHES_URL = `${SITE}/en/matches`;

// The official /en/matches page server-renders the current season's next
// gameweek. Its match links carry everything we need:
//   /en/game/214?season=season-4&gameday=1&team1=deportrio&team2=wembley-rangers-afc
async function fetchMatchesHtml(fileArg) {
  if (fileArg) return readFileSync(fileArg, "utf8");
  const res = await fetch(MATCHES_URL, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ballerleagueukhub/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${MATCHES_URL}`);
  return res.text();
}

function parseSelectedSeason(html) {
  const m = html.match(/<option\s+value="\d+"\s+selected[^>]*>\s*Season\s+(\d+)\s*<\/option>/);
  return m ? Number(m[1]) : null;
}

function parseMatches(html) {
  const re = /<a href="https:\/\/ballerleague\.uk\/en\/game\/(\d+)\?season=season-(\d+)&(?:amp;)?gameday=(\d+)&(?:amp;)?team1=([a-z0-9-]+)&(?:amp;)?team2=([a-z0-9-]+)"[\s\S]*?<\/a>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[0];
    const timeM = block.match(/<span class="grey">(\d{1,2}:\d{2})<\/span>/);
    // A played match shows a score (e.g. "3 - 1"); an upcoming one shows "vs".
    const hasScore = /blrg-score|class="[^"]*\bscore\b|>\s*\d{1,2}\s*[-–]\s*\d{1,2}\s*</.test(block);
    out.push({
      gameId: Number(m[1]),
      season: Number(m[2]),
      gameweek: Number(m[3]),
      homeSlug: m[4],
      awaySlug: m[5],
      time: timeM ? timeM[1] : null,
      hasScore,
    });
  }
  return out;
}

// Dates aren't on the matches page; take them from the season intake file when
// it describes the season being scraped.
function matchdayDate(season, gameweek) {
  try {
    const s = JSON.parse(readFileSync(SEASON4_PATH, "utf8"));
    if (s.season === season) {
      const md = (s.matchdays || []).find((d) => d.n === gameweek);
      if (md) return md.date;
    }
  } catch {}
  return null;
}

// /en/matches can lag behind the individual game pages — after a gameweek it can
// keep showing the completed week for days, even though the next gameweek's
// pages are already live. Discover those pages directly when the list is stale.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function loadScrapedState() {
  const state = { maxGameId: 0, lastGameweek: {} };
  try {
    const g = JSON.parse(readFileSync(GAMECHANGERS_PATH, "utf8"));
    for (const [season, s] of Object.entries(g.seasons || {})) {
      for (const m of s.matches || []) {
        state.maxGameId = Math.max(state.maxGameId, m.gameId || 0);
        state.lastGameweek[season] = Math.max(state.lastGameweek[season] || 0, m.gameweek || 0);
      }
    }
  } catch {}
  return state;
}

async function fetchGameHtml(id) {
  const url = `${SITE}/en/game/${id}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ballerleagueukhub/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.text();
}

function parseGamePage(html, gameId) {
  const headerStart = html.indexOf("bl-gameday-header");
  if (headerStart === -1) return null;
  const headerEnd = html.indexOf("bl-gameday-name", headerStart);
  const header = html.slice(headerStart, headerEnd === -1 ? headerStart + 9000 : headerEnd);

  const names = [...header.matchAll(/bl-gameday-team-name[^"]*uk-visible@m[^"]*"[^>]*>([^<]+)</g)]
    .map((m) => m[1].trim());
  if (names.length < 2) return null;

  const logoIds = [...header.matchAll(/logo_(\d+)\.(?:svg|png)"[^>]*bl-gameday-team-logo/g)]
    .map((m) => Number(m[1]));

  // The page carries the league table, which maps official team id -> team slug.
  const idToSlug = {};
  const linkRe = /data-team-id="(\d+)"[\s\S]{0,800}?\/en\/teams\/([a-z0-9-]+)/g;
  let lm;
  while ((lm = linkRe.exec(html)) !== null) {
    if (!idToSlug[lm[1]]) idToSlug[lm[1]] = lm[2];
  }
  const homeSlug = idToSlug[logoIds[0]];
  const awaySlug = idToSlug[logoIds[1]];
  if (!homeSlug || !awaySlug) return null;

  const gwM = html.match(/bl-gameday-name"[^>]*>\s*GAMEDAY\s*(\d{1,2})/i)
    || html.match(/GAMEDAY\s*(\d{1,2})/i);
  if (!gwM) return null;

  let status = null;
  let homeScore = null;
  let awayScore = null;
  const flowM = html.match(/id="match-flow-data">([\s\S]*?)<\/script>/);
  if (flowM) {
    try {
      const flow = JSON.parse(flowM[1]);
      status = flow.status || null;
      homeScore = typeof flow.home_score === "number" ? flow.home_score : null;
      awayScore = typeof flow.away_score === "number" ? flow.away_score : null;
    } catch {}
  }

  const dtM = header.match(/datetime="(\d{4})-(\d{2})-(\d{2})T/);
  const timeM = header.match(/<time[^>]*>(\d{1,2}:\d{2})<\/time>/);

  return {
    gameId,
    gameweek: Number(gwM[1]),
    homeSlug,
    awaySlug,
    homeName: names[0],
    awayName: names[1],
    status,
    homeScore,
    awayScore,
    date: dtM ? `${parseInt(dtM[3])} ${MONTHS[parseInt(dtM[2]) - 1]} ${dtM[1]}` : null,
    time: timeM ? timeM[1] : null,
  };
}

async function discoverUpcomingFromGamePages(season) {
  const { maxGameId, lastGameweek } = loadScrapedState();
  if (!maxGameId) return [];

  const lastGw = lastGameweek[String(season)] || 0;
  const PROBE_LIMIT = 30;
  let targetGw = null;
  const found = [];

  for (let id = maxGameId + 1; id <= maxGameId + PROBE_LIMIT; id++) {
    const html = await fetchGameHtml(id);
    if (!html) continue;
    const f = parseGamePage(html, id);
    if (!f || !f.time) continue;
    if (f.gameweek <= lastGw) continue;

    const isScheduled = f.status
      ? f.status === "scheduled"
      : f.homeScore === 0 && f.awayScore === 0;

    if (!isScheduled) {
      if (targetGw !== null && f.gameweek > targetGw) break;
      continue;
    }

    if (targetGw === null) targetGw = f.gameweek;
    if (f.gameweek < targetGw) {
      targetGw = f.gameweek;
      found.length = 0;
    }
    if (f.gameweek > targetGw) break;
    found.push(f);
  }

  return found.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

async function main() {
  const fileIdx = process.argv.indexOf("--file");
  const fileArg = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

  const html = await fetchMatchesHtml(fileArg);
  const season = parseSelectedSeason(html);
  const all = parseMatches(html);

  if (!season) throw new Error("could not determine the selected season from /en/matches");

  const seasonMatches = all.filter((m) => m.season === season);
  let upcomingRaw = seasonMatches
    .filter((m) => !m.hasScore && m.time)
    .map((m) => ({
      gameweek: m.gameweek,
      homeSlug: m.homeSlug,
      awaySlug: m.awaySlug,
      time: m.time,
      date: null,
    }));

  console.log(`Season ${season}: ${seasonMatches.length} match links (${upcomingRaw.length} upcoming)`);

  if (upcomingRaw.length === 0) {
    console.log("No upcoming fixtures on /en/matches — checking individual game pages...");
    upcomingRaw = await discoverUpcomingFromGamePages(season);
    if (upcomingRaw.length > 0) {
      console.log(`Found ${upcomingRaw.length} upcoming fixture(s) on game pages (GW${upcomingRaw[0].gameweek}).`);
    }
  }

  if (upcomingRaw.length === 0) {
    console.log("No upcoming fixtures found (current gameweek may be complete and the next one is not published). Leaving fixtures.json unchanged.");
    return;
  }

  const table = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
  const bySlug = Object.fromEntries(table.map((t) => [t.slug, t]));

  const unknown = new Set();
  const upcoming = upcomingRaw
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    .map((m) => {
      const home = bySlug[m.homeSlug];
      const away = bySlug[m.awaySlug];
      if (!home) unknown.add(m.homeSlug);
      if (!away) unknown.add(m.awaySlug);
      return {
        gameweek: m.gameweek,
        season,
        homeTeam: home?.team ?? m.homeSlug,
        homeSlug: m.homeSlug,
        homeEmoji: home?.emoji ?? "⚽",
        awayTeam: away?.team ?? m.awaySlug,
        awaySlug: m.awaySlug,
        awayEmoji: away?.emoji ?? "⚽",
        date: matchdayDate(season, m.gameweek) || m.date,
        time: m.time,
      };
    });

  if (unknown.size) console.log(`  (warning) slugs not in table.json: ${[...unknown].join(", ")}`);

  const existing = existsSync(FIXTURES_PATH)
    ? JSON.parse(readFileSync(FIXTURES_PATH, "utf8"))
    : { results: [] };

  const output = { upcoming, results: existing.results || [] };
  writeFileSync(FIXTURES_PATH, JSON.stringify(output, null, 2) + "\n");

  for (const f of upcoming) {
    console.log(`  GW${f.gameweek} ${f.time} ${f.homeTeam} vs ${f.awayTeam}${f.date ? ` (${f.date})` : ""}`);
  }
  console.log(`Fixtures written: ${FIXTURES_PATH}`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
