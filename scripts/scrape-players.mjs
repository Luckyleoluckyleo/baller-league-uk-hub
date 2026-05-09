import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "src", "data", "players.json");
const CACHE_DIR = resolve(__dirname, ".cache-players");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const TEAM_LOGO_MAP = {
  "330": { slug: "yanited", name: "Yanited" },
  "331": { slug: "wembley-rangers-afc", name: "Wembley Rangers AFC" },
  "332": { slug: "vzn-fc", name: "VZN FC" },
  "334": { slug: "sds-fc", name: "SDS FC" },
  "337": { slug: "n5-fc", name: "N5 FC" },
  "340": { slug: "deportrio", name: "Deportrio" },
  "342": { slug: "ndl-fc", name: "NDL FC" },
  "343": { slug: "clutch-fc", name: "Clutch FC" },
  "344": { slug: "rukkas-fc", name: "Rukkas FC" },
  "345": { slug: "prime-fc", name: "Prime FC" },
  "346": { slug: "gold-devils-fc", name: "Gold Devils FC" },
  "347": { slug: "community-fc", name: "Community FC" },
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

function parsePlayerPage(html, slug) {
  const result = {
    slug,
    name: null,
    team: null,
    teamSlug: null,
    position: null,
    age: null,
    number: null,
    seasons: {},
  };

  // Name
  const nameM = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (nameM) result.name = nameM[1].trim();

  // Position — format: "Position:</b> Striker"
  const posM = html.match(/Position:[^>]*>\s*([^<&\n]+)/);
  if (posM) result.position = posM[1].trim();

  // Age
  const ageM = html.match(/Age:\s*(\d+)/);
  if (ageM) result.age = parseInt(ageM[1]);

  // Number — format: "#50</div>" or similar
  const numM = html.match(/>(?:#|No\.?\s*)(\d{1,2})\s*</);
  if (numM) result.number = parseInt(numM[1]);

  // Team — find from the logo URL embedded in the page JSON
  const logoM = html.match(/logo_(\d{3})\.svg/);
  if (logoM) {
    const team = TEAM_LOGO_MAP[logoM[1]];
    if (team) {
      result.team = team.name;
      result.teamSlug = team.slug;
    }
  }

  // Check for season tabs to know which seasons have data
  const hasS2 = html.includes("Season 2");
  const hasS3 = html.includes("Season 3");

  // Parse stats for each available season
  // The stats section has key-value pairs like: "Apps 8", "Goals 15", etc.
  // We extract these by looking for labels followed by numbers

  // Stats — format: <div>8</div><span>Apps</span>
  const appsM = html.match(/<div[^>]*>(\d+)<\/div>\s*<span>Apps<\/span>/);
  const goalsM = html.match(/<div[^>]*>(\d+)<\/div>\s*<span>Goals<\/span>/);
  const assistsM = html.match(/<div[^>]*>(\d+)<\/div>\s*<span>Assists<\/span>/);

  // Detailed stats section
  const statsSection = html.slice(
    html.indexOf("Total Passes") !== -1 ? html.indexOf("Total Passes") - 200 : html.length / 2,
    html.indexOf("Match Log") !== -1 ? html.indexOf("Match Log") : html.length
  );

  const statPairs = {};
  const statRe = /([A-Za-z][A-Za-z\s]+(?:inc\s?goals)?(?:Excl\s?[A-Za-z\s&]+)?)\s*(\d+)/g;
  let m;
  while ((m = statRe.exec(statsSection)) !== null) {
    const key = m[1].trim();
    const val = parseInt(m[2]);
    if (key.length > 3 && key.length < 60) statPairs[key] = val;
  }

  // For simplicity, use the prominently displayed numbers for S3
  const s3Stats = { apps: null, goals: null, assists: null, detailed: {} };
  if (appsM) s3Stats.apps = parseInt(appsM[1]);
  if (goalsM) s3Stats.goals = parseInt(goalsM[1]);
  if (assistsM) s3Stats.assists = parseInt(assistsM[1]);
  s3Stats.detailed = statPairs;

  if (appsM || goalsM || assistsM) {
    result.seasons["3"] = s3Stats;
  }

  return result;
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
    const player = parsePlayerPage(html, slug);
    if (player.name) {
      players.push(player);
      console.log(`  [${i + 1}/${slugs.length}] ${player.name} (${player.team || "?"}) — ${player.position || "?"}`);
    } else {
      console.log(`  [${i + 1}/${slugs.length}] ${slug}: parse incomplete`);
    }

    if (i % 3 === 2) await new Promise(r => setTimeout(r, 150));
  }

  // Build output
  const output = { players };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nDone! ${players.length} players saved to ${OUT_PATH}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
