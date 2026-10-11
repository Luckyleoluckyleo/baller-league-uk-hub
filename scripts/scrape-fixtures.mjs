import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FIXTURES_PATH = resolve(ROOT, "src", "data", "fixtures.json");
const TABLE_PATH = resolve(ROOT, "src", "data", "table.json");
const SEASON4_PATH = resolve(ROOT, "src", "data", "season4.json");

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

async function main() {
  const fileIdx = process.argv.indexOf("--file");
  const fileArg = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

  const html = await fetchMatchesHtml(fileArg);
  const season = parseSelectedSeason(html);
  const all = parseMatches(html);

  if (!season) throw new Error("could not determine the selected season from /en/matches");

  const seasonMatches = all.filter((m) => m.season === season);
  const upcomingRaw = seasonMatches.filter((m) => !m.hasScore && m.time);

  console.log(`Season ${season}: ${seasonMatches.length} match links (${upcomingRaw.length} upcoming)`);

  if (upcomingRaw.length === 0) {
    console.log("No upcoming fixtures found (current gameweek may be complete). Leaving fixtures.json unchanged.");
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
        date: matchdayDate(season, m.gameweek),
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
