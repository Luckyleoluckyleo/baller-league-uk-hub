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
};

async function download(slug, id) {
  const url = `https://ballerleague.uk/uploads/teams/logo_${id}.svg`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) { console.log(`  ${slug}: HTTP ${resp.status}`); return false; }
    const svg = await resp.text();
    writeFileSync(resolve(OUT_DIR, `${slug}.svg`), svg);
    console.log(`  ${slug}: downloaded (${svg.length} bytes)`);
    return true;
  } catch (e) {
    console.log(`  ${slug}: error - ${e.message}`);
    return false;
  }
}

console.log("Downloading team logos...");
for (const [slug, id] of Object.entries(LOGO_IDS)) {
  await download(slug, id);
}
console.log("Done!");
