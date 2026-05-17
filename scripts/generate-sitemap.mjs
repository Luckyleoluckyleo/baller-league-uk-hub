import { writeFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");
const SITE = "https://ballerleagueukhub.com";

function isExcluded(url) {
  if (url === "404" || url === "compare/" || url === "roundup/") return true;
  if (url.startsWith("admin") || url.startsWith("google")) return true;
  if (url.startsWith("match/s3-")) return true;
  return false;
}

function walk(dir, base = "") {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walk(full, rel));
    } else if (entry.name.endsWith(".html") || entry.name.endsWith(".xml")) {
      const url = rel
        .replace(/\\/g, "/")
        .replace(/index\.html$/, "")
        .replace(/\.html$/, "");
      if (!isExcluded(url)) {
        const fullUrl = `${SITE}/${url}`;
        const { mtime } = statSync(full);
        results.push({ url: fullUrl, path: rel, mtime });
      }
    }
  }
  return results;
}

const pages = walk(DIST_DIR);
pages.sort((a, b) => a.url.localeCompare(b.url));

const normalizeUrl = (u) => u.replace(/\/$/, "");

function getPriority(url) {
  const u = normalizeUrl(url);
  if (u === `${SITE}`) return "1.0";
  if (u === `${SITE}/table` || u === `${SITE}/teams` || u === `${SITE}/players`) return "0.9";
  if (u.startsWith(`${SITE}/teams/`) || u.startsWith(`${SITE}/players/`)) return "0.7";
  if (u.startsWith(`${SITE}/news/`) || u.startsWith(`${SITE}/roundup/`)) return "0.7";
  if (u.startsWith(`${SITE}/match/`)) return "0.6";
  if (u === `${SITE}/gamechangers` || u === `${SITE}/h2h` || u === `${SITE}/rules` || u === `${SITE}/watch`) return "0.6";
  return "0.5";
}

function getChangefreq(url) {
  const u = normalizeUrl(url);
  if (u === `${SITE}` || u === `${SITE}/table`) return "daily";
  if (u.startsWith(`${SITE}/news/`) || u.startsWith(`${SITE}/roundup/`)) return "weekly";
  return "monthly";
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${p.mtime.toISOString()}</lastmod>
    <changefreq>${getChangefreq(p.url)}</changefreq>
    <priority>${getPriority(p.url)}</priority>
  </url>`).join("\n")}
</urlset>`;

writeFileSync(resolve(DIST_DIR, "sitemap.xml"), sitemap);
console.log(`Sitemap generated: ${pages.length} URLs`);
