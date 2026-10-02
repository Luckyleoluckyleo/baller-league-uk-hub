import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const players = JSON.parse(fs.readFileSync(path.join(rootDir, "src/data/players.json"), "utf-8")).players;

const ogPlayers = path.join(rootDir, "public/og/players");
const ogManagers = path.join(rootDir, "public/og/managers");
fs.mkdirSync(ogPlayers, { recursive: true });
fs.mkdirSync(ogManagers, { recursive: true });

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function circular(src, size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(src).resize(size, size, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function baseSvg(kicker, title, subtitle) {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f1625"/>
      <stop offset="100%" style="stop-color:#1b2840"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#00e676"/>
      <stop offset="100%" style="stop-color:#00c853"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>
  <text x="120" y="90" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="#64748b" letter-spacing="6">BALLER LEAGUE UK HUB</text>
  <circle cx="290" cy="360" r="170" fill="rgba(0,230,118,0.08)" stroke="rgba(0,230,118,0.35)" stroke-width="2"/>
  <text x="530" y="300" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="#00e676" letter-spacing="4">${esc(kicker)}</text>
  <text x="530" y="390" font-family="Bebas Neue, Impact, sans-serif" font-size="82" font-weight="700" fill="#edf0ff">${esc(title)}</text>
  <text x="530" y="445" font-family="Inter, sans-serif" font-size="30" font-weight="500" fill="#94a3b8">${esc(subtitle)}</text>
</svg>`;
}

async function render(svg, photoPath, outFile) {
  let img = sharp(Buffer.from(svg));
  if (photoPath && fs.existsSync(photoPath)) {
    try {
      const circle = await circular(photoPath, 320);
      img = sharp(Buffer.from(svg)).composite([{ input: circle, top: 200, left: 130 }]);
    } catch {}
  }
  await img.png().toFile(outFile);
}

// Players
let pCount = 0;
for (const p of players) {
  const s = p.seasons?.["3"] || {};
  const sub = `${p.team} · ${s.goals || 0} goals · ${s.assists || 0} assists`;
  const svg = baseSvg("PLAYER PROFILE", p.name, sub);
  await render(svg, path.join(rootDir, `public/players/${p.slug}.webp`), path.join(ogPlayers, `${p.slug}.png`));
  pCount++;
}

// Managers (from content frontmatter)
const mgrDir = path.join(rootDir, "src/content/managers");
let mCount = 0;
for (const file of fs.readdirSync(mgrDir).filter((f) => f.endsWith(".md"))) {
  const body = fs.readFileSync(path.join(mgrDir, file), "utf-8");
  const get = (k) => (body.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?`, "m")) || [])[1]?.trim();
  const name = get("name");
  const team = get("team");
  const teamName = get("teamName");
  const role = get("role") || "Manager";
  const image = get("image") || team;
  const slug = file.replace(".md", "");
  if (!name || !team) continue;
  const svg = baseSvg("MANAGER", name, `${role} · ${teamName}`);
  await render(svg, path.join(rootDir, `public/managers/${image}.webp`), path.join(ogManagers, `${slug}.png`));
  mCount++;
}

console.log(`Generated ${pCount} player OG images and ${mCount} manager OG images`);
