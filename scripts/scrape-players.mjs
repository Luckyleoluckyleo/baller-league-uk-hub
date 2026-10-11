import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "src", "data", "players.json");
const CACHE_DIR = resolve(__dirname, ".cache-players");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const TEAM_LOGO_MAP = {
  "330": { slug: "yanited", name: "RTG FC" },
  "331": { slug: "wembley-rangers-afc", name: "Wembley Rangers AFC" },
  "332": { slug: "vzn-fc", name: "VZN FC" },
  "334": { slug: "sds-fc", name: "SDS FC" },
  "337": { slug: "n5-fc", name: "N5 FC" },
  "340": { slug: "deportrio", name: "Deportrio" },
  "342": { slug: "ndl-fc", name: "NDL FC" },
  "343": { slug: "clutch-fc", name: "Clutch FC" },
  "344": { slug: "rukkas-fc", name: "P17 FC" },
  "345": { slug: "prime-fc", name: "Prime FC" },
  "346": { slug: "gold-devils-fc", name: "Gold Devils FC" },
  "347": { slug: "community-fc", name: "Community FC" },
  "348": { slug: "toma", name: "Toma" },
};

async function fetchCached(url, cacheName) {
  const cachePath = resolve(CACHE_DIR, cacheName);
  try {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, "utf8");
      if (raw.length > 1000) return raw;
    }
  } catch {}

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const text = await resp.text();
    try { writeFileSync(cachePath, text); } catch {}
    return text;
  } catch {
    return null;
  }
}

async function discoverPlayerSlugs() {
  console.log("Discovering player slugs...");
  const allSlugs = new Set();

  for (let page = 1; page <= 15; page++) {
    const html = await fetchCached(
      `https://ballerleague.uk/en/players?page=${page}`,
      `list-page-${page}.html`
    );
    if (!html) {
      if (page > 11) break;
      console.log(`  Page ${page}: failed to fetch`);
      continue;
    }

    const slugs = [...new Set([...html.matchAll(/\/en\/player\/([a-z0-9-]+)/g)].map(m => m[1]))];
    console.log(`  Page ${page}: ${slugs.length} players`);
    for (const s of slugs) allSlugs.add(s);

    if (slugs.length < 10) break;
  }

  console.log(`  Total unique slugs: ${allSlugs.size}\n`);
  return [...allSlugs];
}

function parseStatsFromAjaxHtml(ajaxHtml) {
  // The AJAX response is JSON: {"html":"<div ...>"}
  let html;
  try {
    const parsed = JSON.parse(ajaxHtml);
    html = typeof parsed.html === 'string' ? parsed.html : ajaxHtml;
  } catch {
    html = ajaxHtml;
  }

  // Unescape JSON-escaped slashes: \/ -> /
  html = html.replace(/\\\//g, "/");

  // Main stats: <div class="team-color">10</div><span>Apps</span>
  const appsM = html.match(/<div[^>]*class="[^"]*team-color[^"]*"[^>]*>(\d+)<\/div>\s*<span>Apps<\/span>/);
  const goalsM = html.match(/<div[^>]*class="[^"]*team-color[^"]*"[^>]*>(\d+)<\/div>\s*<span>Goals<\/span>/);
  const assistsM = html.match(/<div[^>]*class="[^"]*team-color[^"]*"[^>]*>(\d+)<\/div>\s*<span>Assists<\/span>/);

  // Detailed stats: <div><p class="team-color">195</p></div>
  const detailed = {};
  const detRe = /<p title="([^"]+)"[^>]*>[^<]+<\/p>\s*<\/div>\s*<div>\s*<p class="team-color">(\d+)<\/p>/g;
  let m;
  while ((m = detRe.exec(html)) !== null) {
    detailed[m[1].trim()] = parseInt(m[2]);
  }

  return {
    apps: appsM ? parseInt(appsM[1]) : null,
    goals: goalsM ? parseInt(goalsM[1]) : null,
    assists: assistsM ? parseInt(assistsM[1]) : null,
    detailed,
  };
}

// The player page embeds the current club as a JSON blob in data-current-team,
// which is the most reliable team source (survives logo/png/svg changes).
function parseTeamFromDataset(html) {
  const m = html.match(/data-current-team="([^"]*)"/);
  if (!m) return null;
  const raw = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.slug) return { slug: obj.slug, name: obj.name };
  } catch {}
  return null;
}

function parsePlayerMeta(html, slug) {
  const result = {
    slug,
    name: null,
    team: null,
    teamSlug: null,
    position: null,
    age: null,
    number: null,
  };

  const nameM = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (nameM) {
    result.name = nameM[1].trim()
      .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  }

  const posM = html.match(/Position:[^>]*>\s*([^<&\n]+)/);
  if (posM) result.position = posM[1].trim();

  const ageM = html.match(/Age:\s*(\d+)/);
  if (ageM) result.age = parseInt(ageM[1]);

  const numM = html.match(/>(?:#|No\.?\s*)(\d{1,2})\s*</);
  if (numM) result.number = parseInt(numM[1]);

  const datasetTeam = parseTeamFromDataset(html);
  if (datasetTeam) {
    result.team = datasetTeam.name;
    result.teamSlug = datasetTeam.slug;
  } else {
    const logoM = html.match(/logo_(\d{3})\.(?:png|svg)/);
    if (logoM) {
      const team = TEAM_LOGO_MAP[logoM[1]];
      if (team) {
        result.team = team.name;
        result.teamSlug = team.slug;
      }
    }
  }

  return result;
}

function extractSeasonOptions(html) {
  // Each <option value="6">Season 3</option> maps an internal season id to a season number.
  return [...html.matchAll(/<option\s+value="(\d+)"[^>]*>\s*Season\s+(\d+)\s*<\/option>/g)]
    .map((m) => ({ id: m[1], season: Number(m[2]) }));
}

function extractAjaxEndpoint(html) {
  const epM = html.match(/data-endpoint="([^"]+ajax[^"]+stats\/SEASON_ID)"/);
  if (epM) return epM[1];
  return null;
}

async function main() {
  const slugs = await discoverPlayerSlugs();
  console.log(`Scraping ${slugs.length} player pages...\n`);

  const players = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const html = await fetchCached(
      `https://ballerleague.uk/en/player/${slug}`,
      `player-${slug}.html`
    );
    if (!html) {
      console.log(`  [${i + 1}/${slugs.length}] ${slug}: FAILED`);
      continue;
    }

    const player = parsePlayerMeta(html, slug);
    if (!player.name) {
      console.log(`  [${i + 1}/${slugs.length}] ${slug}: parse incomplete`);
      continue;
    }

    // Fetch every season shown in the page's season picker via the AJAX endpoint.
    const seasonOptions = extractSeasonOptions(html);
    const ajaxEndpoint = extractAjaxEndpoint(html);

    if (ajaxEndpoint && seasonOptions.length) {
      const seasons = {};
      for (const { id, season } of seasonOptions) {
        const ajaxUrl = ajaxEndpoint.replace("SEASON_ID", id);
        const ajaxCacheName = `player-${slug}-s${season}.html`;
        const ajaxHtml = await fetchCached(ajaxUrl, ajaxCacheName);
        if (ajaxHtml) {
          const stats = parseStatsFromAjaxHtml(ajaxHtml);
          seasons[String(season)] = {
            apps: stats.apps,
            goals: stats.goals,
            assists: stats.assists,
            detailed: stats.detailed,
          };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (Object.keys(seasons).length) player.seasons = seasons;
    }

    players.push(player);
    const latest = player.seasons?.["4"] || player.seasons?.["3"];
    console.log(`  [${i + 1}/${slugs.length}] ${player.name} (${player.team || "?"}) — ${player.position || "?"}${latest ? ` [${latest.goals}G/${latest.apps}Apps]` : ""}`);

    if (i % 3 === 2) await new Promise(r => setTimeout(r, 150));
  }

  // Build output
  const output = { players };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nDone! ${players.length} players saved to ${OUT_PATH}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
