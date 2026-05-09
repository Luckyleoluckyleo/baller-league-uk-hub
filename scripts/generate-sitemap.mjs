import { writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");
const SITE = "https://ballerleagueuk.com";

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
        results.push({ url: fullUrl, path: rel });
      }
    }
  }
  return results;
}

const pages = walk(DIST_DIR);
pages.sort((a, b) => a.url.localeCompare(b.url));

const now = new Date().toISOString();

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.url === `${SITE}/` ? "1.0" : p.url.startsWith(`${SITE}/news/`) ? "0.7" : "0.8"}</priority>
  </url>`).join("\n")}
</urlset>`;

writeFileSync(resolve(DIST_DIR, "sitemap.xml"), sitemap);
console.log(`Sitemap generated: ${pages.length} URLs`);
