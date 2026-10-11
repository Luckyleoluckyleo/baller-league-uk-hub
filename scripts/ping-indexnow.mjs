import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// IndexNow: notify Bing/Yandex (and others) of new/updated URLs instantly so
// matchday content is discovered without waiting for the next crawl. Google
// ignores this endpoint and relies on the sitemap + crawl cadence.
//
// The key is served at https://ballerleagueukhub.com/<KEY>.txt (public/<KEY>.txt).
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITEMAP = resolve(ROOT, "dist", "sitemap.xml");

const HOST = "ballerleagueukhub.com";
const KEY = "b123b85dacfe67412deadf2ec711534d";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

if (!existsSync(SITEMAP)) {
  console.log("  (skipped IndexNow: dist/sitemap.xml not found — run the build first)");
  process.exit(0);
}

const xml = readFileSync(SITEMAP, "utf8");
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

if (!urlList.length) {
  console.log("  (skipped IndexNow: no URLs found in sitemap)");
  process.exit(0);
}

try {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
    signal: AbortSignal.timeout(20000),
  });
  console.log(`  IndexNow: submitted ${urlList.length} URLs → HTTP ${res.status}`);
} catch (e) {
  // Never fail the pipeline over a notification ping.
  console.log(`  IndexNow: submission skipped (${e.message})`);
}
