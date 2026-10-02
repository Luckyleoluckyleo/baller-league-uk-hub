import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "src", "data", "gamechangers.json");
const PLAYERS_PATH = resolve(__dirname, "..", "src", "data", "players.json");
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

// Franchises carry a stable official team id across seasons; the display name
// changes (e.g. "MVPs United" -> "Prime", "Trebol FC" -> "NDL"). We key on the
// id, not the name, so historical seasons are detected correctly.
const TEAMS = [
  { id: 330, slug: "yanited", emoji: "👑", canonical: "Yanited", names: { 1: "Yanited", 2: "Yanited", 3: "Yanited" } },
  { id: 331, slug: "wembley-rangers-afc", emoji: "🏟️", canonical: "Wembley Rangers AFC", names: { 1: "Wembley Rangers", 2: "Wembley Rangers", 3: "Wembley Rangers" } },
  { id: 332, slug: "vzn-fc", emoji: "👁️", canonical: "VZN FC", names: { 1: "VZN", 2: "VZN", 3: "VZN" } },
  { id: 334, slug: "sds-fc", emoji: "🟢", canonical: "SDS FC", names: { 1: "SDS", 2: "SDS", 3: "SDS" } },
  { id: 337, slug: "n5-fc", emoji: "5️⃣", canonical: "N5 FC", names: { 1: "N5", 2: "N5", 3: "N5" } },
  { id: 339, slug: "m7-fc", emoji: "7️⃣", canonical: "M7", names: { 1: "M7", 2: "M7" } },
  { id: 340, slug: "deportrio", emoji: "🔴", canonical: "Deportrio", names: { 1: "Deportrio", 2: "Deportrio", 3: "Deportrio" } },
  { id: 342, slug: "ndl-fc", emoji: "🏆", canonical: "NDL FC", names: { 1: "Trebol FC", 2: "NDL", 3: "NDL" } },
  { id: 343, slug: "clutch-fc", emoji: "✊", canonical: "Clutch FC", names: { 1: "Santan FC", 2: "Clutch", 3: "Clutch" } },
  { id: 344, slug: "rukkas-fc", emoji: "💀", canonical: "Rukkas FC", names: { 1: "F.C RTW", 2: "Rukkas", 3: "Rukkas" } },
  { id: 345, slug: "prime-fc", emoji: "⚡", canonical: "Prime FC", names: { 1: "MVPs United", 2: "MVPs United", 3: "Prime" } },
  { id: 346, slug: "gold-devils-fc", emoji: "👿", canonical: "Gold Devils FC", names: { 1: "26ers", 2: "26ers", 3: "Gold Devils" } },
  { id: 347, slug: "community-fc", emoji: "🤝", canonical: "Community FC", names: { 3: "Community Team" } },
];
const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
// The same franchise is renamed between seasons, so map every historical name to its team.
const NAME_TO_TEAM = {};
for (const t of TEAMS) for (const n of Object.values(t.names)) NAME_TO_TEAM[n] = t;

const GC_MAP = {
  "plus one": "plusone", "the line": "theline",
  "3play": "3play", "3 play": "3play",
  "onside": "onside",
  "1:1": "1on1", "1-on-1": "1on1", "1v1": "1on1", "1 v 1": "1on1",
  "fairplay": "fairplay", "fair play": "fairplay",
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

// ---- Player name -> team lookup ----
let playerTeamMap = null;
function getPlayerTeamMap() {
  if (playerTeamMap) return playerTeamMap;
  playerTeamMap = {};
  try {
    const data = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
    for (const p of data.players || []) {
      playerTeamMap[p.name.toLowerCase()] = p.teamSlug;
    }
  } catch {}
  return playerTeamMap;
}

// ---- Parse ----

function parsePlayerStats(html, homeSlug, awaySlug) {
  const players = [];

  // Find the player stats container
  const psIdx = html.indexOf('id="player-stats-container"');
  if (psIdx === -1) return players;

  const psEnd = html.indexOf('</tbody>', psIdx);
  if (psEnd === -1) return players;

  const section = html.slice(psIdx, psEnd + 8);

  // Parse each player row - extract name and all stat cells
  const rowRe = /<tr[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<\/tr>/g;
  let m;
  while ((m = rowRe.exec(section)) !== null) {
    const name = m[1].trim();
    const rowHtml = m[0];

    // Extract stat cells: G, A, S, T, PTY, R, C, P
    const cells = [];
    const cellRe = /<td class="uk-text-center">([^<]*)<\/td>/g;
    let cm;
    while ((cm = cellRe.exec(rowHtml)) !== null) {
      cells.push(parseInt(cm[1]) || 0);
    }

    if (cells.length >= 8) {
      // The team beside the player row (logo id) is the reliable per-match source;
      // fall back to the global name map only if the row has no team logo.
      const logoId = (rowHtml.match(/logo_(\d+)\.svg/) || [])[1];
      const fromLogo = logoId ? TEAM_BY_ID[Number(logoId)] : null;
      const teamSlug = fromLogo ? fromLogo.slug : (getPlayerTeamMap()[name.toLowerCase()] || null);

      players.push({
        name,
        team: teamSlug,
        goals: cells[0],
        assists: cells[1],
        shots: cells[2],
        tackles: cells[3],
        penalties: cells[4],
        redCards: cells[5],
        corners: cells[6],
        passes: cells[7],
      });
    }
  }

  return players;
}

function parseGoalscorersFromTimeline(html) {
  const goalscorers = [];

  const tlStart = html.indexOf("TIMELINE");
  if (tlStart === -1) return goalscorers;

  const tlEnd = Math.min(
    html.indexOf("SQUADS", tlStart) !== -1 ? html.indexOf("SQUADS", tlStart) : html.length,
    html.indexOf("STANDINGS", tlStart) !== -1 ? html.indexOf("STANDINGS", tlStart) : html.length,
  );
  const section = html.slice(tlStart, tlEnd);

  // Match event blocks: minute + emoji + details
  // Each event is in a div with class "uk-margin-small-bottom" containing minute, emoji, and details
  const eventBlockRe = /<div class="uk-margin-small-bottom"[^>]*>[\s\S]*?(?=<div class="uk-margin-small-bottom"|<hr|$)/g;
  let block;
  while ((block = eventBlockRe.exec(section)) !== null) {
    const blockHtml = block[0];

    // Get the minute
    const minuteM = blockHtml.match(/(\d+)'/);
    if (!minuteM) continue;
    const minute = parseInt(minuteM[1]);

    // Check if this is a goal (has "Goal", "Penalty", or "Own Goal" subtext)
    if (/>(Goal|Pen.+?y|Own\s*Goal)</i.test(blockHtml)) {
      // Extract player name - the div with color: white and font-weight: bold
      const nameM = blockHtml.match(/<div style="color:\s*white[^"]*font-weight:\s*bold[^"]*">([^<]+)<\/div>/);
      if (nameM) {
        goalscorers.push({
          minute,
          player: nameM[1].trim(),
        });
      }
    }
  }

  return goalscorers;
}

function parseMatch(html, gameId) {
  const headerStart = html.indexOf("bl-gameday-header");
  const headerEnd = headerStart !== -1
    ? (html.indexOf("bl-gameday-name", headerStart) !== -1 ? html.indexOf("bl-gameday-name", headerStart) : headerStart + 9000)
    : html.length;
  const header = html.slice(Math.max(0, headerStart), headerEnd);

  const scoreM = header.match(/>\s*(\d{1,2})\s*-\s*(\d{1,2})\s*</);
  if (!scoreM) return null;
  const score = { home: parseInt(scoreM[1]), away: parseInt(scoreM[2]) };

  let gameday;
  const gwM = html.match(/GAMEDAY\s*(\d{1,2})/i);
  if (gwM) {
    gameday = parseInt(gwM[1]);
  } else if (/GAMEDAY\s*(F4)/i.test(html)) {
    gameday = 12;
  } else {
    return null;
  }

  // Identify teams from the header. Names are the reliable signal (some logos are
  // served from a CDN without an id); the logo id is a fallback for pages whose
  // header names are missing.
  const headerNames = [...header.matchAll(/bl-gameday-team-name[^"]*uk-visible@m[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  const logoIds = [...header.matchAll(/logo_(\d+)\.svg"[^>]*bl-gameday-team-logo/g)].map((m) => Number(m[1]));
  const ht = NAME_TO_TEAM[headerNames[0]] || TEAM_BY_ID[logoIds[0]];
  const at = NAME_TO_TEAM[headerNames[1]] || TEAM_BY_ID[logoIds[1]];
  if (!ht || !at) return null;
  const homeTeam = ht.canonical;
  const awayTeam = at.canonical;
  const homeName = headerNames[0] || ht.canonical;
  const awayName = headerNames[1] || at.canonical;

  // Date/time from the header's ISO <time datetime="YYYY-MM-DDTHH:MM:SS...">
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let matchDate = null;
  const dtM = header.match(/datetime="(\d{4})-(\d{2})-(\d{2})T/);
  if (dtM) matchDate = `${parseInt(dtM[3])} ${MONTHS[parseInt(dtM[2]) - 1]} ${dtM[1]}`;
  const timeM = header.match(/<time[^>]*>(\d{1,2}:\d{2})<\/time>/) || header.match(/bl-gameday-hour[^>]*>\s*([\d:]{4,5})/);
  const rawTime = timeM ? timeM[1] : null;

  // Two seasons per year: a spring season (Mar-Jun) and an autumn season (Sep-Feb).
  // S1=2025 spring, S2=2025 autumn (->Jan 2026), S3=2026 spring, S4=2026 autumn...
  // Derive from the match date so new seasons are auto-detected; fall back to id ranges.
  let season;
  if (dtM) {
    const year = parseInt(dtM[1]);
    const month = parseInt(dtM[2]);
    if (month >= 9) season = (year - 2025) * 2 + 2;
    else if (month <= 2) season = (year - 2026) * 2 + 2;
    else season = (year - 2025) * 2 + 1;
  } else {
    season = gameId >= 145 ? 3 : gameId >= 70 ? 2 : 1;
  }

  // Parse Game Changers and goal minutes from timeline
  const tlStart = html.indexOf("TIMELINE");
  const gcEntries = [];
  const goalMinutes = [];
  if (tlStart !== -1) {
    const tlEnd = Math.min(
      html.indexOf("SQUADS", tlStart) !== -1 ? html.indexOf("SQUADS", tlStart) : html.length,
      html.indexOf("STANDINGS", tlStart) !== -1 ? html.indexOf("STANDINGS", tlStart) : html.length,
    );
    const section = html.slice(tlStart, tlEnd);

    // GC entries — match both ⭐ (old icon) and ⚡ (GW11+ icon), with optional wrapper div
    const gcRe = /(\d{1,2})'\s*<\/div>\s*<div[^>]*>\s*[⭐⚡]\s*<\/div>\s*<div[^>]*>\s*(?:<div[^>]*>\s*)?([^<]+?)\s*<\/div>\s*<div[^>]*>\s*GAME CHANGER/g;
    let m;
    while ((m = gcRe.exec(section)) !== null) {
      gcEntries.push({ minute: parseInt(m[1]), typeName: m[2].trim() });
    }

    if (gcEntries.length === 0) {
      for (const icon of ["⭐", "⚡"]) {
        let pos = 0;
        while ((pos = section.indexOf(icon, pos)) !== -1) {
          const before = section.slice(Math.max(0, pos - 250), pos);
          const bm = before.match(/(\d{1,2})'\s*<\/div>/);
          const after = section.slice(pos, pos + 400);
          const am = after.match(/[\s\S]*?<div[^>]*>\s*(?:<div[^>]*>\s*)?([^<]+?)\s*<\/div>\s*<div[^>]*>\s*GAME CHANGER/);
          if (bm && am) gcEntries.push({ minute: parseInt(bm[1]), typeName: am[1].trim() });
          pos++;
        }
      }
    }

    // Goal minutes
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

  // NEW: Parse player stats and goalscorers
  const playerStats = parsePlayerStats(html, ht.slug, at.slug);
  const goalscorers = parseGoalscorersFromTimeline(html);

  return {
    season, gameId, gameweek: gameday,
    homeTeam, homeSlug: ht.slug, homeEmoji: ht.emoji, homeName,
    awayTeam, awaySlug: at.slug, awayEmoji: at.emoji, awayName,
    homeScore: score.home, awayScore: score.away,
    gc1, gc2, gc1Goals, gc2Goals,
    playerStats,
    goalscorers,
    matchDate, matchTime: rawTime,
  };
}

// ---- Main ----

async function main() {
  const SCAN_MAX = 450;
  console.log(`Scanning game IDs 1-${SCAN_MAX} for UK matches...\n`);

  const allIds = [];
  for (let batchStart = 1; batchStart <= SCAN_MAX; batchStart += 10) {
    const batch = [];
    for (let id = batchStart; id < batchStart + 10 && id <= SCAN_MAX; id++) batch.push(id);

    const results = await Promise.all(
      batch.map(async (id) => {
        const html = await fetchHtml(id);
        if (!html || html.length < 5000) return null;
        const names = [...html.matchAll(/bl-gameday-team-name[^"]*uk-visible@m[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
        if (names.length < 2) return null;
        return NAME_TO_TEAM[names[0]] && NAME_TO_TEAM[names[1]] ? id : null;
      })
    );

    let found = false;
    for (const id of results) { if (id) { allIds.push(id); found = true; } }
    if (!found && allIds.length > 0) {
      const lastFound = allIds[allIds.length - 1];
      if (batchStart > lastFound + 150) {
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
      if (match.homeScore === 0 && match.awayScore === 0 && !match.gc1 && !match.gc2) {
        console.log(`  [${i + 1}/${allIds.length}] S${match.season} GW${String(match.gameweek).padStart(2, " ")} ${match.homeTeam} vs ${match.awayTeam} - UPCOMING${match.matchDate ? ` (${match.matchDate})` : ""}`);
        continue;
      }
      matches.push(match);
      if (match.gc1 === "theline") { match.gc1 = "onside"; match._fixed = true; }
      const gsCount = match.goalscorers?.length || 0;
      console.log(`  [${i + 1}/${allIds.length}] S${match.season} GW${String(match.gameweek).padStart(2, " ")} ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} | GC1:${match.gc1 || "?"} GC2:${match.gc2 || "?"} (${match.gc1Goals + match.gc2Goals} GC goals) | ${gsCount} goal scorers${match._fixed ? " [FIXED]" : ""}`);
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
          gameId: m.gameId,
          homeTeam: m.homeTeam, homeSlug: m.homeSlug, homeEmoji: m.homeEmoji, homeName: m.homeName,
          awayTeam: m.awayTeam, awaySlug: m.awaySlug, awayEmoji: m.awayEmoji, awayName: m.awayName,
          homeScore: m.homeScore, awayScore: m.awayScore,
          gamechanger1: { type: m.gc1 || "unknown", goalsScored: m.gc1Goals },
          gamechanger2: { type: m.gc2 || "unknown", goalsScored: m.gc2Goals },
          playerStats: (m.playerStats || []).map(p => ({
            name: p.name,
            team: p.team,
            goals: p.goals,
            assists: p.assists,
            shots: p.shots,
            tackles: p.tackles,
            penalties: p.penalties,
            redCards: p.redCards,
            corners: p.corners,
            passes: p.passes,
          })),
          goalscorers: (m.goalscorers || []).map(g => ({
            minute: g.minute,
            player: g.player,
          })),
          matchDate: m.matchDate || null,
          matchTime: m.matchTime || null,
        })),
      }]),
    ),
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  const total = matches.length;
  const withGC = matches.filter((m) => m.gc1 && m.gc2).length;
  const withStats = matches.filter((m) => m.playerStats?.length > 0).length;
  const withGoalscorers = matches.filter((m) => m.goalscorers?.length > 0).length;
  const withDates = matches.filter((m) => m.matchDate).length;
  console.log(`\nDone! ${total} matches across ${Object.keys(seasons).length} seasons`);
  console.log(`${withGC}/${total} with Gamechanger data (${total * 2} GC events)`);
  console.log(`${withStats}/${total} with player stats (${matches.reduce((s, m) => s + (m.playerStats?.length || 0), 0)} player entries)`);
  console.log(`${withGoalscorers}/${total} with goal scorer data (${matches.reduce((s, m) => s + (m.goalscorers?.length || 0), 0)} goal events)`);
  console.log(`${withDates}/${total} with match dates`);
  console.log(`Output: ${OUT_PATH}`);
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
