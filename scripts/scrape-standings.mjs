import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(ROOT, "src", "data", "standings.json");
const TABLE_PATH = resolve(ROOT, "src", "data", "table.json");

const SITE = "https://ballerleague.uk";
const GC_PATH = resolve(ROOT, "src", "data", "gamechangers.json");

// A representative (latest) game page per season carries that season's final league table.
// Prefer real game ids recorded in gamechangers.json so new seasons are picked up automatically.
function seasonGameIds() {
  const map = { "1": 1, "2": 73, "3": 145 };
  try {
    const gc = JSON.parse(readFileSync(GC_PATH, "utf8"));
    for (const [season, s] of Object.entries(gc.seasons)) {
      for (const m of s.matches) {
        if (m.gameId && (!map[season] || m.gameId > map[season])) map[season] = m.gameId;
      }
    }
  } catch {}
  return map;
}

function parseStandings(html) {
  const start = html.indexOf("STANDINGS");
  if (start === -1) return null;
  const tbodyStart = html.indexOf("<tbody", start);
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  if (tbodyStart === -1 || tbodyEnd === -1) return null;
  const body = html.slice(tbodyStart, tbodyEnd);
  const rows = [...body.matchAll(/<tr[^>]*data-team-id="(\d+)"[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const num = (row, re) => {
    const m = row.match(re);
    return m ? Number(m[1]) : 0;
  };
  return rows.map((row) => ({
    teamId: num(row, /data-team-id="(\d+)"/),
    pos: num(row, /standings-position">(\d+)/),
    team: ((row.match(/blhr-name[\s\S]*?uk-visible@m[^>]*>([^<]+)</) || [])[1] || "").trim(),
    slug: (row.match(/\/en\/teams\/([a-z0-9-]+)/) || [])[1],
    played: num(row, /standings-played">(\d+)/),
    won: num(row, /standings-win">(\d+)/),
    drawn: num(row, /standings-tie">(\d+)/),
    lost: num(row, /standings-loss">(\d+)/),
    gd: num(row, /standings-gd">([+-]?\d+)/),
    ep: num(row, /standings-ep">([+-]?\d+)/),
    pts: num(row, /standings-points">(\d+)/),
  }));
}

const out = {};
for (const [season, id] of Object.entries(seasonGameIds())) {
  const res = await fetch(`${SITE}/en/game/${id}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ballerleagueukhub/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for game/${id}`);
  const rows = parseStandings(await res.text());
  if (!rows || !rows.length) throw new Error(`could not parse standings for season ${season}`);
  out[season] = rows;
  const totalEp = rows.reduce((s, r) => s + r.ep, 0);
  console.log(`  S${season}: ${rows.length} teams (EP total ${totalEp})`);
}

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`Standings written: ${OUT_PATH}`);

// Keep table.json (the current-season metadata carrier) EP values in sync.
try {
  const tableData = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
  const latestKey = Object.keys(out).sort((a, b) => Number(b) - Number(a))[0];
  const latest = out[latestKey] || [];
  const epBySlug = Object.fromEntries(latest.map((r) => [r.slug, r.ep]));
  let changed = 0;
  for (const row of tableData) {
    if (epBySlug[row.slug] !== undefined && row.ep !== epBySlug[row.slug]) {
      row.ep = epBySlug[row.slug];
      changed++;
    }
  }
  if (changed) {
    writeFileSync(TABLE_PATH, JSON.stringify(tableData, null, 2));
    console.log(`  table.json EP updated for ${changed} team(s)`);
  }
} catch (e) {
  console.log(`  (skipped table.json EP sync: ${e.message})`);
}
