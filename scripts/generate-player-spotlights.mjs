import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTENT_DIR = resolve(ROOT, "src", "content", "news");
const PLAYERS_CONTENT_DIR = resolve(ROOT, "src", "content", "players");

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const playerData = read("src/data/players.json");
const fixturesData = read("src/data/fixtures.json");

if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });

const CURRENT_SEASON = fixturesData.upcoming[0]?.season ?? 4;
const players = playerData.players;

function parseFm(raw) {
  if (!raw.startsWith("---")) return { body: raw.trim() };
  const end = raw.indexOf("---", 3);
  const front = raw.slice(3, end);
  const body = raw.slice(end + 3).trim();
  const fm = {};
  for (const line of front.split("\n")) {
    const m = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].trim();
    if (v.startsWith("[")) {
      try { fm[k] = JSON.parse(v); } catch { fm[k] = []; }
    } else if (v.startsWith('"') && v.endsWith('"')) {
      fm[k] = v.slice(1, -1);
    } else if (v === ">" || v === "|") {
      fm[k] = "";
    } else {
      fm[k] = v;
    }
  }
  fm.body = body;
  return fm;
}

function statsFor(slug) {
  const p = players.find((x) => x.slug === slug);
  if (!p) return null;
  const seasons = Object.keys(p.seasons || {}).map(Number).sort((a, b) => b - a);
  const s = String(seasons.find((k) => (p.seasons?.[k]?.apps || 0) > 0) ?? seasons[0] ?? CURRENT_SEASON);
  return { player: p, season: s, stats: p.seasons?.[s] || {} };
}

function joinList(arr) {
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}

const files = readdirSync(PLAYERS_CONTENT_DIR).filter((f) => f.endsWith(".md"));
const dateStr = new Date().toISOString().split("T")[0];

let n = 0;
for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const fm = parseFm(readFileSync(resolve(PLAYERS_CONTENT_DIR, file), "utf8"));
  const formerClubs = Array.isArray(fm.formerClubs) ? fm.formerClubs : [];
  const honours = Array.isArray(fm.honours) ? fm.honours : [];
  // Only spotlight players with a real background worth writing about.
  if (formerClubs.length === 0 && honours.length === 0) continue;

  const name = fm.name || slug;
  const teamName = fm.teamName || "";
  const position = fm.position || "";
  const nationality = fm.nationality || "";
  const biography = (fm.body || "").trim();
  const st = statsFor(slug);

  const title = `Player Spotlight: ${name} — ${teamName}`;
  const excerpt = `A closer look at ${name}${position ? `, ${position.toLowerCase()}` : ""}${teamName ? ` for ${teamName}` : ""} in Baller League UK Season ${CURRENT_SEASON} — career, honours and what he brings to the 6v6 game.`;

  let s = `---\ntitle: "${title}"\ndate: ${dateStr}\ncategory: "Feature"\nexcerpt: "${excerpt.replace(/"/g, "'")}"\nauthor: "Baller League UK Hub"\nfeatured: false\n---\n\n`;
  s += `## ${name}: Baller League UK Player Spotlight\n\n`;
  s += `**${name}**${position ? ` is a ${position.toLowerCase()}` : ""}${teamName ? ` for **${teamName}**` : ""} in Baller League UK Season ${CURRENT_SEASON}. `;
  if (formerClubs.length) s += `A former ${joinList(formerClubs)} player, he brings genuine professional experience to the 6v6 format.\n\n`;
  else s += `\n\n`;

  if (biography) s += `${biography}\n\n`;

  if (formerClubs.length) {
    s += `## Career\n\n`;
    s += `${name} built his professional career at ${joinList(formerClubs)}. `;
    s += `That grounding in the full-sided game — the positioning, the decision-making and the technical standards — translates neatly to the fast, high-tempo Baller League, where the Game Changers demand quick thinking and composure under pressure.\n\n`;
  }

  if (honours.length) {
    s += `## Honours & achievements\n\n`;
    for (const h of honours) s += `- ${h}\n`;
    s += `\n`;
  }

  if (st && (st.stats.apps || 0) > 0) {
    s += `## Baller League record\n\n`;
    s += `| Season | Apps | Goals | Assists |\n|--------|------|-------|---------|\n`;
    s += `| ${st.season} | ${st.stats.apps || 0} | ${st.stats.goals || 0} | ${st.stats.assists || 0} |\n\n`;
    s += `See his full stats on his [player profile](/players/${slug}).\n\n`;
  }

  s += `---\n\n*Read more player and club profiles on the [players hub](/players) and [teams hub](/teams), and follow the new season on the [Season ${CURRENT_SEASON} hub](/season-4).*\n`;

  writeFileSync(resolve(CONTENT_DIR, `player-spotlight-${slug}.md`), s);
  console.log(`  player-spotlight-${slug}.md`);
  n++;
}

console.log(`\nDone! ${n} player spotlights generated.`);
