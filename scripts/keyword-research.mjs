/**
 * UK-only Google Autocomplete research.
 *
 * Manual tool — not part of the weekly pipeline. It samples Google's
 * autocomplete endpoint for Baller League UK seed terms and writes a
 * deduplicated CSV of query ideas to docs/keyword-opportunities.csv.
 *
 * Usage: node scripts/keyword-research.mjs
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "docs", "keyword-opportunities.csv");

const SEEDS = [
  "baller league ",
  "baller league arena ",
  "baller league tickets ",
  "baller league table ",
  "baller league standings ",
  "baller league teams ",
  "baller league players ",
  "baller league squads ",
  "baller league managers ",
  "baller league fixtures ",
  "baller league results ",
  "baller league scores ",
  "baller league rules ",
  "baller league game changers ",
  "baller league final four ",
  "baller league season 3 ",
  "baller league season 4 ",
  "baller league how to watch ",
  "baller league stats ",
  "baller league records ",
  "baller league transfer ",
  "baller league predictions ",
];

// Alphabet-expand the highest-value seeds where long-tail intent is richest.
const ALPHABET_SEEDS = new Set([
  "baller league arena ",
  "baller league tickets ",
  "baller league table ",
  "baller league players ",
  "baller league managers ",
]);

const NON_UK = /\b(usa|u\.s\.|miami|tropical park|america|american|arizona|atlanta|new york|los angeles|canada|australia|india|singapore|germany)\b/i;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function suggest(q) {
  const url =
    "https://suggestqueries.google.com/complete/search?client=firefox&hl=en-GB&gl=uk&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ballerleagueukhub-research/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.[1]) ? json[1] : [];
}

function categoryFor(seed) {
  if (/arena|tickets/.test(seed)) return "venue_tickets";
  if (/table|standing|scores|results/.test(seed)) return "tables_results";
  if (/team|squad|player|manager/.test(seed)) return "teams_players";
  if (/rule|game changer|watch|stat|record|transfer|predict/.test(seed)) return "guides";
  return "other";
}

const found = new Map();

async function collect(query, seed) {
  try {
    const suggestions = await suggest(query);
    for (const s of suggestions) {
      const clean = String(s).trim().replace(/\s+/g, " ");
      if (!clean || NON_UK.test(clean)) continue;
      if (!clean.toLowerCase().includes("baller league")) continue;
      if (!found.has(clean)) {
        found.set(clean, { query: clean, seed, category: categoryFor(seed) });
      }
    }
  } catch (e) {
    console.warn(`  ! ${query.trim()} — ${e.message}`);
  }
}

console.log(`Sampling ${SEEDS.length} seeds…`);
for (const seed of SEEDS) {
  await collect(seed, seed);
  await sleep(180);
}

console.log(`Alphabet-expanding ${ALPHABET_SEEDS.size} seeds…`);
for (const seed of ALPHABET_SEEDS) {
  for (const letter of ALPHABET) {
    await collect(seed + letter, seed);
    await sleep(120);
  }
}

const rows = [...found.values()].sort((a, b) =>
  a.category.localeCompare(b.category) || a.query.localeCompare(b.query)
);

const csv = [
  "query,seed,category",
  ...rows.map((r) => [r.query, r.seed.trim(), r.category].map(csvCell).join(",")),
].join("\n") + "\n";

writeFileSync(OUT, csv);
console.log(`\nWrote ${rows.length} UK query ideas → ${OUT}`);
console.log("Next: map each query to an existing page (FAQ/heading) or a new standalone page.");
