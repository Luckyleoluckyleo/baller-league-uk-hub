import { execSync } from "child_process";
import { rmSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CACHE_DIR = resolve(__dirname, ".cache");

function run(cmd, label) {
  console.log(`\n━━━ ${label} ━━━\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    console.log(`\n✓ ${label} done`);
  } catch (e) {
    console.error(`\n✗ ${label} failed:`, e.message);
    process.exit(1);
  }
}

console.log("╔══════════════════════════════════╗");
console.log("║  Baller League UK Hub — Update  ║");
console.log("╚══════════════════════════════════╝");

if (existsSync(CACHE_DIR)) {
  console.log("\nClearing stale match cache...");
  rmSync(CACHE_DIR, { recursive: true, force: true });
}

run("node scripts/scrape.mjs", "1/6 Scraping match results");
run("node scripts/scrape-ep.mjs", "2/6 Scraping EP values");
run("node scripts/scrape-players.mjs", "3/6 Scraping player stats");
run("node scripts/generate-reports.mjs", "4/6 Generating match reports");
run("node scripts/generate-previews.mjs", "5/6 Generating fixture previews");

console.log("\n⚠  Don't forget to manually update:");
console.log("   src/data/fixtures.json — next gameweek fixtures");

run("npm run build", "6/6 Building site + sitemap");

console.log("\n✓ All done! Site ready in dist/");
