/**
 * Rewrites internal page links in the built HTML to the canonical trailing-slash
 * form. Astro outputs directory pages (e.g. /teams/index.html), and Netlify 301s
 * the non-slash URL, but authored links often omit the slash. That creates an
 * extra hop and splits Search Console signals between /teams and /teams/.
 *
 * Only links that resolve to a real `dist/<path>/index.html` are rewritten, so
 * assets, API files, anchors and legacy redirects are left untouched.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

if (!existsSync(DIST)) {
  console.warn("normalize-internal-links: dist/ not found — skipped.");
  process.exit(0);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".html")) out.push(path);
  }
  return out;
}

const files = walk(DIST);
let changed = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(/href="(\/[^"#?]*)"/g, (full, path) => {
    if (path === "/" || path.endsWith("/")) return full;
    if (/\.[a-zA-Z0-9]+$/.test(path)) return full;
    const target = resolve(DIST, "." + path, "index.html");
    return existsSync(target) ? `href="${path}/"` : full;
  });

  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}

console.log(`Normalized internal links in ${changed} HTML file(s).`);
