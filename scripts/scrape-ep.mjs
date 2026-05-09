import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const TABLE_PATH = resolve(__dirname, "..", "src", "data", "table.json");

if (!existsSync(CACHE_DIR)) {
  console.log("No cache directory found. Run scrape.mjs first.");
  process.exit(1);
}

const teamEPMap = {
  "NDL FC": { ep: 0 },
  "Prime FC": { ep: 0 },
  "SDS FC": { ep: 0 },
  "Deportrio": { ep: 0 },
  "Yanited": { ep: 0 },
  "Clutch FC": { ep: 0 },
  "N5 FC": { ep: 0 },
  "Wembley Rangers AFC": { ep: 0 },
  "Gold Devils FC": { ep: 0 },
  "VZN FC": { ep: 0 },
  "Rukkas FC": { ep: 0 },
  "Community FC": { ep: 0 },
};

// Find latest cache file that has a STANDINGS section
const fs = await import("fs");
const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith(".html")).sort((a, b) => {
  return parseInt(b) - parseInt(a);
});

let found = false;
for (const file of files) {
  const html = readFileSync(resolve(CACHE_DIR, file), "utf8");
  const s = html.indexOf("STANDINGS");
  if (s === -1) continue;

  const chunk = html.slice(s, s + 8000);
  const rows = chunk.matchAll(/standings-position"[^>]*>(\d+)<[\s\S]*?blhr-name[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?standings-ep"[^>]*>([^<]+)</g);

  for (const m of rows) {
    const name = m[2].trim();
    const epRaw = m[3].trim();
    const ep = parseInt(epRaw) || 0;
    if (teamEPMap[name] !== undefined) {
      teamEPMap[name].ep = ep;
    }
  }

  found = true;
  break;
}

if (!found) {
  console.log("No STANDINGS section found in cached pages.");
  process.exit(1);
}

const tableData = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
for (const row of tableData) {
  if (teamEPMap[row.team]) {
    row.ep = teamEPMap[row.team].ep;
  }
}

writeFileSync(TABLE_PATH, JSON.stringify(tableData, null, 2));
console.log("EP values updated from official standings:");
for (const row of tableData) {
  console.log(`  ${row.team}: EP ${row.ep}`);
}
