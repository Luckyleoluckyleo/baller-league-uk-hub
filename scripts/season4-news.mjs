// Season 4 news monitor — a READ-ONLY discovery aid.
// Fetches Google News RSS for a set of Season 4 queries, de-duplicates against
// previously-seen headlines, and prints only what's new. Writes nothing except
// the small seen-list cache (scripts/.cache/s4-seen.json, gitignored).
//
// Usage:
//   node scripts/season4-news.mjs            # only new items since last run
//   node scripts/season4-news.mjs --all      # show everything found
//   node scripts/season4-news.mjs --days=30  # only items from the last N days

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const SEEN_PATH = resolve(CACHE_DIR, "s4-seen.json");

const QUERIES = [
  '"Baller League UK" season 4',
  "Baller League UK transfer",
  "Baller League UK manager",
  'Baller League UK new team',
  "Baller League UK squad",
  "gymskin Baller League",
  '"Baller League" signing',
];

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const daysArg = args.find((a) => a.startsWith("--days="));
const maxAgeDays = daysArg ? Number(daysArg.split("=")[1]) : 0;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

async function fetchQuery(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; ballerleagueukhub-monitor)" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const b = m[1];
      return {
        title: decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""),
        link: decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || ""),
        pub: (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "",
        source: decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || ""),
      };
    });
  } catch {
    return [];
  }
}

function loadSeen() {
  try {
    return new Set(JSON.parse(readFileSync(SEEN_PATH, "utf8")));
  } catch {
    return new Set();
  }
}

const seen = loadSeen();
const now = Date.now();
let totalNew = 0;

for (const query of QUERIES) {
  const items = await fetchQuery(query);
  const fresh = items.filter((it) => {
    if (daysArg && it.pub) {
      const age = (now - new Date(it.pub).getTime()) / 86400000;
      if (age > maxAgeDays) return false;
    }
    return showAll || !seen.has(it.title.toLowerCase());
  });

  console.log(`\n━━━ ${query} (${fresh.length}) ━━━`);
  if (fresh.length === 0) {
    console.log("  (nothing new)");
  }
  for (const it of fresh) {
    const when = it.pub ? new Date(it.pub).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
    console.log(`  • ${it.title}`);
    console.log(`      ${it.source}${when ? " · " + when : ""}`);
    console.log(`      ${it.link}`);
    totalNew++;
  }
  for (const it of items) seen.add(it.title.toLowerCase());
}

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
writeFileSync(SEEN_PATH, JSON.stringify([...seen], null, 0));

console.log(`\n${totalNew} item(s) surfaced. Seen-list now holds ${seen.size} headlines.`);
console.log("Triage these, then turn confirmed stories into src/content/news/*.md and structured data.");
