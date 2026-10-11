import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "logos");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const LOGO_IDS = {
  "ndl-fc": 342,
  "prime-fc": 345,
  "sds-fc": 334,
  "deportrio": 340,
  "yanited": 330,
  "clutch-fc": 343,
  "n5-fc": 337,
  "wembley-rangers-afc": 331,
  "gold-devils-fc": 346,
  "vzn-fc": 332,
  "rukkas-fc": 344,
  "community-fc": 347,
  "toma": 348,
};

async function download(slug, id) {
  // The official site now serves PNG logos (SVG was used previously), so try SVG
  // first and fall back to wrapping the PNG in an SVG so pages can keep the
  // `/logos/{slug}.svg` convention.
  for (const ext of ["svg", "png"]) {
    const url = `https://ballerleague.uk/uploads/teams/logo_${id}.${ext}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      if (ext === "svg") {
        writeFileSync(resolve(OUT_DIR, `${slug}.svg`), await resp.text());
      } else {
        const buf = Buffer.from(await resp.arrayBuffer());
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="data:image/png;base64,${buf.toString("base64")}"/></svg>`;
        writeFileSync(resolve(OUT_DIR, `${slug}.svg`), svg);
      }
      console.log(`  ${slug}: downloaded (${ext})`);
      return true;
    } catch (e) {
      /* try next extension */
    }
  }
  console.log(`  ${slug}: not found`);
  return false;
}

console.log("Downloading team logos...");
for (const [slug, id] of Object.entries(LOGO_IDS)) {
  await download(slug, id);
}
console.log("Done!");
