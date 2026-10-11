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

run("node scripts/scrape-fixtures.mjs", "1/16 Scraping upcoming fixtures");
run("node scripts/scrape.mjs", "2/16 Scraping match results");
run("node scripts/scrape-standings.mjs", "3/16 Scraping official standings + EP");
run("node scripts/scrape-players.mjs", "4/16 Scraping player stats");
run("node scripts/generate-placeholders.mjs", "5/16 Generating missing player images");
run("node scripts/generate-reports.mjs", "6/16 Generating match reports");
run("node scripts/generate-previews.mjs", "7/16 Generating fixture previews");
run("node scripts/generate-team-previews.mjs", "8/16 Generating team previews");
run("node scripts/generate-player-spotlights.mjs", "9/16 Generating player spotlights");
run("node scripts/generate-team-history.mjs", "10/16 Generating club history pages");
run("node scripts/generate-og.mjs", "11/16 Generating default OG image");
run("node scripts/generate-og-images.mjs", "12/16 Generating per-match OG images");
run("node scripts/generate-og-people.mjs", "13/16 Generating player + manager OG images");
run("node scripts/verify-data.mjs", "14/16 Verifying data against official");

run("npm run build", "15/16 Building site + sitemap");

run("node scripts/ping-indexnow.mjs", "16/16 Notifying IndexNow (Bing)");

console.log("\n✓ All done! Site ready in dist/");
