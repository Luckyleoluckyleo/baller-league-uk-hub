import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "src", "data", "gamechangers.json");
const CACHE_DIR = resolve(__dirname, ".cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const GC_DEFS = {
  firstHalf: [
    { id: "onside", name: "Onside", description: "All offside rules suspended", icon: "🏃" },
    { id: "plusone", name: "PlusOne", description: "Start 1v1, each goal adds a player", icon: "➕" },
    { id: "3play", name: "3Play", description: "3-a-side with 30-second shot clock", icon: "⏱️" },
  ],
  secondHalf: [
    { id: "1on1", name: "1-on-1", description: "One-on-one duel, 15-second shot clock", icon: "⚔️" },
    { id: "theline", name: "The Line", description: "Goals from distance count double", icon: "📏" },
    { id: "fairplay", name: "Fairplay", description: "Any foul = immediate send-off", icon: "🟥" },
  ],
};

const TEAMS = [
  { name: "NDL FC", slug: "ndl-fc", emoji: "🏆" },
  { name: "Prime FC", slug: "prime-fc", emoji: "⚡" },
  { name: "SDS FC", slug: "sds-fc", emoji: "🟢" },
  { name: "Deportrio", slug: "deportrio", emoji: "🔴" },
  { name: "Yanited", slug: "yanited", emoji: "👑" },
  { name: "Clutch FC", slug: "clutch-fc", emoji: "✊" },
  { name: "N5 FC", slug: "n5-fc", emoji: "5️⃣" },
  { name: "Wembley Rangers AFC", slug: "wembley-rangers-afc", emoji: "🏟️" },
  { name: "Gold Devils FC", slug: "gold-devils-fc", emoji: "👿" },
  { name: "VZN FC", slug: "vzn-fc", emoji: "👁️" },
  { name: "Rukkas FC", slug: "rukkas-fc", emoji: "💀" },
  { name: "Community FC", slug: "community-fc", emoji: "🤝" },
];
const TEAM_SET = new Set(TEAMS.map((t) => t.name));
const TEAM_MAP = Object.fromEntries(TEAMS.map((t) => [t.name, t]));

const GC_MAP = {
  "plus one": "plusone", "the line": "theline",
  "3play": "3play", "3play": "3play", "3 play": "3play", "3 Play": "3play",
  "onside": "onside", "1:1": "1on1", "1-on-1": "1on1", "fairplay": "fairplay",
};

// ---- Fetch ----

async function fetchHtml(id) {
  const cachePath = resolve(CACHE_DIR, `${id}.html`);
  try {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, "utf8");
      if (raw.length > 5000) return raw;
    }
  } catch {}

  const url = `https://ballerleague.uk/en/game/${id}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      if (resp.status === 302) {
        const loc = resp.headers.get("location");
        if (loc) {
          const gidM = loc.match(/\/game\/(\d+)/);
          if (gidM) return fetchHtml(Number(gidM[1]));
        }
      }
      return null;
    }
    const text = await resp.text();
    try { writeFileSync(cachePath, text); } catch {}
    return text;
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Parse ----

function parseMatch(html, gameId) {
  const scoreM = html.match(/>\s*(\d{1,2})\s*-\s*(\d{1,2})\s*</);
  if (!scoreM) return null;
  const score = { home: parseInt(scoreM[1]), away: parseInt(scoreM[2]) };

  const gwM = html.match(/GAMEDAY\s*(\d{1,2})/i);
  if (!gwM) return null;
  const gameday = parseInt(gwM[1]);

  const scoreIdx = html.search(/>\s*\d{1,2}\s*-\s*\d{1,2}\s*</);
  const near = html.slice(Math.max(0, scoreIdx - 5000), Math.min(html.length, scoreIdx + 2000));

  const teamHits = [];
  for (const t of TEAM_SET) {
    let pos = 0;
    while ((pos = near.indexOf(t, pos)) !== -1) {
      teamHits.push(t);
      pos += t.length;
    }
  }
  if (teamHits.length < 2) return null;

  const unique = [...new Set(teamHits)];
  if (unique.length < 2) return null;

  const count = {};
  for (const t of teamHits) count[t] = (count[t] || 0) + 1;
  const [a, b] = unique;
  const homeTeam = (count[a] || 0) >= (count[b] || 0) ? a : b;
  const awayTeam = homeTeam === a ? b : a;

  let season;
  if (gameId >= 145 && gameId <= 200) season = 3;
  else if (gameId >= 73) season = 2;
  else season = 1;

  const tlStart = html.indexOf("TIMELINE");
  const gcEntries = [];
  const goalMinutes = [];
  if (tlStart !== -1) {
    const tlEnd = Math.min(
      html.indexOf("SQUADS", tlStart) !== -1 ? html.indexOf("SQUADS", tlStart) : html.length,
      html.indexOf("STANDINGS", tlStart) !== -1 ? html.indexOf("STANDINGS", tlStart) : html.length,
    );
    const section = html.slice(tlStart, tlEnd);

    // GC entries
    const gcRe = /(\d{1,2})'\s*<\/div>\s*<div[^>]*>\s*⭐\s*<\/div>\s*<div[^>]*>\s*<div[^>]*>\s*([^<]+?)\s*<\/div>\s*<div[^>]*>\s*GAME CHANGER/g;
    let m;
    while ((m = gcRe.exec(section)) !== null) {
      gcEntries.push({ minute: parseInt(m[1]), typeName: m[2].trim() });
    }

    // Fallback: broader ⭐ scan
    if (gcEntries.length === 0) {
      let pos = 0;
      while ((pos = section.indexOf("⭐", pos)) !== -1) {
        const before = section.slice(Math.max(0, pos - 120), pos);
        const bm = before.match(/(\d{1,2})'\s*<\/div>/);
        const after = section.slice(pos, pos + 250);
        const am = after.match(/<div[^>]*>\s*([^<]+?)\s*<\/div>\s*<div[^>]*>\s*GAME CHANGER/);
        if (bm && am) gcEntries.push({ minute: parseInt(bm[1]), typeName: am[1].trim() });
        pos++;
      }
    }

    // Goals
    const goalRe = /(\d{1,2})'\s*<\/div>\s*<div[^>]*>\s*⚽\s*<\/div>/g;
    while ((m = goalRe.exec(section)) !== null) {
      goalMinutes.push(parseInt(m[1]));
    }
  }

  const firstHalf = gcEntries.filter((e) => e.minute >= 11 && e.minute <= 15);
  const secondHalf = gcEntries.filter((e) => e.minute >= 26 && e.minute <= 30);

  function pickType(events) {
    if (!events.length) return null;
    const cnt = {};
    for (const e of events) {
      const mapped = GC_MAP[e.typeName.toLowerCase()] || e.typeName.toLowerCase();
      cnt[mapped] = (cnt[mapped] || 0) + 1;
    }
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  }

  const gc1 = pickType(firstHalf);
  const gc2 = pickType(secondHalf);
  const gc1Goals = goalMinutes.filter((m) => m >= 12 && m <= 15).length;
  const gc2Goals = goalMinutes.filter((m) => m >= 27 && m <= 29).length;

  const ht = TEAM_MAP[homeTeam] || { slug: homeTeam.toLowerCase().replace(/\s+/g, "-"), emoji: "⚽" };
  const at = TEAM_MAP[awayTeam] || { slug: awayTeam.toLowerCase().replace(/\s+/g, "-"), emoji: "⚽" };

  return { season, gameweek: gameday, homeTeam, homeSlug: ht.slug, homeEmoji: ht.emoji, awayTeam, awaySlug: at.slug, awayEmoji: at.emoji, homeScore: score.home, awayScore: score.away, gc1, gc2, gc1Goals, gc2Goals };
}

// ---- Main ----

async function main() {
  console.log("Scanning game IDs 1-250 for UK matches...\n");

  const allIds = [];
  for (let batchStart = 1; batchStart <= 250; batchStart += 10) {
    const batch = [];
    for (let id = batchStart; id < batchStart + 10 && id <= 250; id++) batch.push(id);

    const results = await Promise.all(
      batch.map(async (id) => {
        const html = await fetchHtml(id);
        if (!html || html.length < 5000) return null;
        const scoreIdx = html.search(/>\s*\d{1,2}\s*-\s*\d{1,2}\s*</);
        if (scoreIdx === -1) return null;
        const near = html.slice(Math.max(0, scoreIdx - 5000), Math.min(html.length, scoreIdx + 2000));
        let ukTeamCount = 0;
        for (const t of TEAM_SET) { if (near.includes(t)) ukTeamCount++; }
        return ukTeamCount >= 2 ? id : null;
      })
    );

    let found = false;
    for (const id of results) { if (id) { allIds.push(id); found = true; } }
    if (!found && allIds.length > 0) {
      const lastFound = allIds[allIds.length - 1];
      if (batchStart > lastFound + 50) {
        console.log(`  No UK games after ID ${lastFound}, stopping.`);
        break;
      }
    }
    if (batchStart % 50 === 1) console.log(`  Scanned up to ID ${batchStart + 9}...`);
    await sleep(100);
  }

  console.log(`\nFound ${allIds.length} UK game IDs. Parsing...\n`);

  const matches = [];
  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    const html = await fetchHtml(id);
    if (!html) { console.log(`  [${i + 1}/${allIds.length}] ID ${id}: no HTML`); continue; }
    const match = parseMatch(html, id);
    if (match) {
      // Skip upcoming fixtures (0-0 with no GC data)
      if (match.homeScore === 0 && match.awayScore === 0 && !match.gc1 && !match.gc2) {
        console.log(`  [${i + 1}/${allIds.length}] S${match.season} GW${String(match.gameweek).padStart(2, " ")} ${match.homeTeam} vs ${match.awayTeam} - UPCOMING, SKIPPING`);
        continue;
      }
      matches.push(match);
      // Fix: Baller League site mis-labels Onside as "The Line" in 1st half
      if (match.gc1 === "theline") { match.gc1 = "onside"; match._fixed = true; }
      console.log(`  [${i + 1}/${allIds.length}] S${match.season} GW${String(match.gameweek).padStart(2, " ")} ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} | GC1:${match.gc1 || "?"} GC2:${match.gc2 || "?"} (${match.gc1Goals + match.gc2Goals} GC goals)${match._fixed ? " [FIXED: theline->onside]" : ""}`);
    } else {
      console.log(`  [${i + 1}/${allIds.length}] ID ${id}: parse failed`);
    }
    if (i % 3 === 2) await sleep(150);
  }

  const seasons = {};
  for (const m of matches) {
    if (!seasons[m.season]) seasons[m.season] = [];
    seasons[m.season].push(m);
  }
  for (const arr of Object.values(seasons)) arr.sort((a, b) => a.gameweek - b.gameweek);

  const output = {
    definitions: GC_DEFS,
    seasons: Object.fromEntries(
      Object.entries(seasons).map(([s, arr]) => [s, {
        label: `Season ${s}`,
        labelShort: `S${s}`,
        matches: arr.map((m) => ({
          gameweek: m.gameweek,
          homeTeam: m.homeTeam, homeSlug: m.homeSlug, homeEmoji: m.homeEmoji,
          awayTeam: m.awayTeam, awaySlug: m.awaySlug, awayEmoji: m.awayEmoji,
          homeScore: m.homeScore, awayScore: m.awayScore,
          gamechanger1: { type: m.gc1 || "unknown", goalsScored: m.gc1Goals },
          gamechanger2: { type: m.gc2 || "unknown", goalsScored: m.gc2Goals },
        })),
      }]),
    ),
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  const total = matches.length;
  const withGC = matches.filter((m) => m.gc1 && m.gc2).length;
  console.log(`\nDone! ${total} matches across ${Object.keys(seasons).length} seasons`);
  console.log(`${withGC}/${total} matches have Gamechanger data (${total * 2} GC events)`);
  console.log(`Output: ${OUT_PATH}`);
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
