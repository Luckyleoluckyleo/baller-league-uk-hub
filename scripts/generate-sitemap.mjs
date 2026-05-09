import { writeFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");
const SITE = "https://ballerleagueukhub.com";

const EXCLUDE = new Set(["404.html", "compare/", "roundup/index.html"]);

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
      const fullUrl = `${SITE}/${url}`;
      if (!EXCLUDE.has(rel) && !rel.includes("roundup/index")) {
        const { mtime } = statSync(full);
        results.push({ url: fullUrl, path: rel, mtime });
      }
    }
  }
  return results;
}

const pages = walk(DIST_DIR);
pages.sort((a, b) => a.url.localeCompare(b.url));

function getPriority(url) {
  if (url === `${SITE}/`) return "1.0";
  if (url === `${SITE}/table` || url === `${SITE}/teams` || url === `${SITE}/players`) return "0.9";
  if (url.startsWith(`${SITE}/teams/`) || url.startsWith(`${SITE}/players/`)) return "0.7";
  if (url.startsWith(`${SITE}/news/`) || url.startsWith(`${SITE}/roundup/`)) return "0.7";
  if (url.startsWith(`${SITE}/match/`)) return "0.6";
  if (url === `${SITE}/gamechangers` || url === `${SITE}/h2h` || url === `${SITE}/rules` || url === `${SITE}/watch`) return "0.6";
  return "0.5";
}

function getChangefreq(url) {
  if (url === `${SITE}/` || url === `${SITE}/table`) return "daily";
  if (url.startsWith(`${SITE}/news/`) || url.startsWith(`${SITE}/roundup/`)) return "weekly";
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
