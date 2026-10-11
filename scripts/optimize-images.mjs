import sharp from "sharp";
import { readdirSync, statSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Longest side kept for headshots. Largest on-site display is 120px (player hero),
// so 320 gives a crisp 2x image while cutting bytes massively from the 800-1100px originals.
const MAX = 320;
const QUALITY = 80;
const DIRS = ["public/players", "public/managers"];

let before = 0;
let after = 0;
let optimized = 0;
let skipped = 0;

for (const rel of DIRS) {
  const dir = resolve(ROOT, rel);
  let files;
  try {
    files = readdirSync(dir).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));
  } catch {
    continue;
  }
  for (const file of files) {
    const p = join(dir, file);
    const size = statSync(p).size;
    before += size;
    // Read into memory so sharp doesn't hold a file handle on the destination
    // (Windows throws a sharing violation on in-place overwrite otherwise).
    const input = readFileSync(p);
    const meta = await sharp(input).metadata();
    // Already small enough — don't re-encode (avoids generation loss on repeat runs).
    if ((meta.width || 0) <= MAX && (meta.height || 0) <= MAX) {
      after += size;
      skipped++;
      continue;
    }
    const buf = await sharp(input)
      .rotate()
      .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    if (buf.length < size) {
      writeFileSync(p, buf);
      after += buf.length;
      optimized++;
    } else {
      after += size;
      skipped++;
    }
  }
}

console.log(`Optimized ${optimized} images (${skipped} left as-is): ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);

// Small square avatars for leaderboard/squad thumbnails (displayed ~34-44px).
const playersDir = resolve(ROOT, "public/players");
const thumbDir = resolve(playersDir, "thumb");
mkdirSync(thumbDir, { recursive: true });
let thumbs = 0;
for (const file of readdirSync(playersDir).filter((f) => /\.webp$/i.test(f))) {
  const src = join(playersDir, file);
  const dst = join(thumbDir, file);
  if (existsSync(dst)) {
    const tm = await sharp(readFileSync(dst)).metadata();
    if ((tm.width || 0) <= 96 && (tm.height || 0) <= 96) continue;
  }
  const buf = await sharp(readFileSync(src))
    .rotate()
    .resize(96, 96, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(dst, buf);
  thumbs++;
}
console.log(`Generated ${thumbs} player thumbnails (96x96)`);

// Team hero images — used as the /teams card backgrounds (displayed up to ~400px
// wide, so 900px gives a crisp 2x). The originals are 0.4–1.4MB each.
const teamsDir = resolve(ROOT, "public/teams");
if (existsSync(teamsDir)) {
  let heroes = 0;
  let hBefore = 0;
  let hAfter = 0;
  for (const file of readdirSync(teamsDir).filter((f) => /\.webp$/i.test(f))) {
    const p = join(teamsDir, file);
    const size = statSync(p).size;
    hBefore += size;
    const input = readFileSync(p);
    const meta = await sharp(input).metadata();
    if ((meta.width || 0) <= 900) {
      hAfter += size;
      continue;
    }
    const buf = await sharp(input)
      .rotate()
      .resize({ width: 900, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    if (buf.length < size) {
      writeFileSync(p, buf);
      hAfter += buf.length;
      heroes++;
    } else {
      hAfter += size;
    }
  }
  console.log(`Optimised ${heroes} team hero images: ${Math.round(hBefore / 1024)}KB -> ${Math.round(hAfter / 1024)}KB`);
}
