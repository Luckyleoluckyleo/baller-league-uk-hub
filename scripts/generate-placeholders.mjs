import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const players = JSON.parse(fs.readFileSync(path.join(rootDir, "src/data/players.json"), "utf-8")).players;

// Also cover hand-written content-collection players (some aren't in players.json).
const contentDir = path.join(rootDir, "src/content/players");
const contentSlugs = fs.existsSync(contentDir)
  ? fs.readdirSync(contentDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""))
  : [];
const allSlugs = [...new Set([...players.map((p) => p.slug), ...contentSlugs])];

// Club accent colours (kept in sync with src/lib/league.ts TEAM_COLORS).
const TEAM_COLORS = {
  "clutch-fc": "#e11d48",
  deportrio: "#e5153c",
  "gold-devils-fc": "#f5a623",
  "n5-fc": "#3b82f6",
  "ndl-fc": "#f59e0b",
  "rukkas-fc": "#8b5cf6",
  "prime-fc": "#22c55e",
  yanited: "#ef4444",
  "sds-fc": "#10b981",
  toma: "#a855f7",
  "vzn-fc": "#38bdf8",
  "wembley-rangers-afc": "#fb7185",
  "m7-fc": "#94a3b8",
  "community-fc": "#14b8a6",
};

// A neutral player silhouette on a dark gradient, haloed in the club colour —
// used whenever no real headshot is available.
function placeholder(size, color) {
  const c = size / 2;
  const accent = color || "#00e676";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22314f"/>
      <stop offset="1" stop-color="#0f1625"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="44%" r="58%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#halo)"/>
  <g fill="#c7d2e0">
    <circle cx="${c}" cy="${size * 0.36}" r="${size * 0.125}"/>
    <path d="M ${size * 0.2} ${size * 0.87}
             C ${size * 0.2} ${size * 0.59} ${size * 0.33} ${size * 0.5} ${c} ${size * 0.5}
             C ${size * 0.67} ${size * 0.5} ${size * 0.8} ${size * 0.59} ${size * 0.8} ${size * 0.87} Z"/>
  </g>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

const teams = Object.fromEntries(players.map((p) => [p.slug, p.teamSlug]));

async function isPlaceholder(file) {
  try {
    // Read into a buffer first: sharp(path) keeps a file handle open on Windows,
    // which blocks the subsequent overwrite.
    const buf = fs.readFileSync(file);
    const meta = await sharp(buf).metadata();
    return meta.width === 320 && meta.height === 320;
  } catch {
    return false;
  }
}

let n = 0;
for (const slug of allSlugs) {
  const main = path.join(rootDir, `public/players/${slug}.webp`);
  const thumb = path.join(rootDir, `public/players/thumb/${slug}.webp`);
  const color = TEAM_COLORS[teams[slug]] || "#00e676";

  if (fs.existsSync(main)) {
    // Keep real headshots; only replace generated 320x320 placeholders.
    if (!(await isPlaceholder(main))) continue;
  }

  fs.writeFileSync(main, await placeholder(320, color));
  fs.writeFileSync(thumb, await placeholder(96, color));
  n++;
}

console.log(`Generated ${n} placeholder player images (with thumbnails)`);
