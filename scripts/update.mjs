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

// Cache clearing disabled — old GWs are final, new GWs cache-bust automatically
// if (existsSync(CACHE_DIR)) {
//   console.log("\nClearing stale match cache...");
//   rmSync(CACHE_DIR, { recursive: true, force: true });
// }

run("node scripts/scrape.mjs", "1/8 Scraping match results");
run("node scripts/scrape-ep.mjs", "2/8 Scraping EP values");
run("node scripts/scrape-players.mjs", "3/8 Scraping player stats");
run("node scripts/generate-reports.mjs", "4/8 Generating match reports");
run("node scripts/generate-previews.mjs", "5/8 Generating fixture previews");
run("node scripts/generate-og.mjs", "6/8 Generating default OG image");
run("node scripts/generate-og-images.mjs", "7/8 Generating per-match OG images");

run("npm run build", "8/8 Building site + sitemap");

console.log("\n✓ All done! Site ready in dist/");
