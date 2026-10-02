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

function placeholder(name, size) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e2d48"/>
      <stop offset="1" stop-color="#0f1625"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size * 0.42}" fill="#00e676">${initials}</text>
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

const names = Object.fromEntries(players.map((p) => [p.slug, p.name]));
for (const slug of contentSlugs) {
  if (!names[slug]) {
    const body = fs.readFileSync(path.join(contentDir, `${slug}.md`), "utf-8");
    names[slug] = (body.match(/^name:\s*"?([^"\n]+)"?/m) || [])[1]?.trim() || slug;
  }
}

let n = 0;
for (const slug of allSlugs) {
  const main = path.join(rootDir, `public/players/${slug}.webp`);
  const thumb = path.join(rootDir, `public/players/thumb/${slug}.webp`);
  if (fs.existsSync(main)) continue;
  fs.writeFileSync(main, await placeholder(names[slug] || slug, 320));
  fs.writeFileSync(thumb, await placeholder(names[slug] || slug, 96));
  n++;
}

console.log(`Generated ${n} placeholder player images (with thumbnails)`);
