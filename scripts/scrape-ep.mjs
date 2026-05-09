import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const TABLE_PATH = resolve(__dirname, "..", "src", "data", "table.json");

const { readdirSync } = await import("fs");

if (!readdirSync(CACHE_DIR).some(f => f.endsWith(".html"))) {
  console.log("No cache found. Run scrape.mjs first.");
  process.exit(1);
}

const files = readdirSync(CACHE_DIR).filter(f => f.endsWith(".html")).sort((a, b) => parseInt(b) - parseInt(a));

let found = false;
for (const file of files) {
  const html = readFileSync(resolve(CACHE_DIR, file), "utf8");
  const s = html.indexOf("STANDINGS");
  if (s === -1) continue;

  const end = html.indexOf("</tbody>", s);
  const chunk = html.slice(s, end + 8);

  const rows = [...chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  const epMap = {};
  for (const row of rows) {
    const rowHtml = row[1];
    const nameM = rowHtml.match(/blhr-name[\s\S]*?uk-visible@m[^>]*>([^<]+)</);
    const epM = rowHtml.match(/standings-ep[^>]*>([^<]+)</);
    if (nameM) {
      const name = nameM[1].trim();
      const ep = parseInt(epM ? epM[1].replace("+", "") : "0") || 0;
      epMap[name] = ep;
    }
  }

  const tableData = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
  for (const row of tableData) {
    if (epMap[row.team] !== undefined) {
      row.ep = epMap[row.team];
    }
  }

  writeFileSync(TABLE_PATH, JSON.stringify(tableData, null, 2));
  console.log("EP values updated from official standings:");
  for (const row of tableData) {
    console.log(`  ${row.team}: EP ${row.ep}`);
  }
  found = true;
  break;
}

if (!found) {
  console.log("No STANDINGS section found in cached pages.");
  process.exit(1);
}
