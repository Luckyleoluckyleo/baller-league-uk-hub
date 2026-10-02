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

run("node scripts/scrape.mjs", "1/11 Scraping match results");
run("node scripts/scrape-standings.mjs", "2/11 Scraping official standings + EP");
run("node scripts/scrape-players.mjs", "3/11 Scraping player stats");
run("node scripts/generate-placeholders.mjs", "4/11 Generating missing player images");
run("node scripts/generate-reports.mjs", "5/11 Generating match reports");
run("node scripts/generate-previews.mjs", "6/11 Generating fixture previews");
run("node scripts/generate-og.mjs", "7/11 Generating default OG image");
run("node scripts/generate-og-images.mjs", "8/11 Generating per-match OG images");
run("node scripts/generate-og-people.mjs", "9/11 Generating player + manager OG images");
run("node scripts/verify-data.mjs", "10/11 Verifying data against official");

run("npm run build", "11/11 Building site + sitemap");

console.log("\n✓ All done! Site ready in dist/");
