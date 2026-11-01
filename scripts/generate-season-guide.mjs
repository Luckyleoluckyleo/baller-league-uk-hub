/**
 * Rebuilds the auto-maintained blocks inside the current season's
 * "everything you need to know" guide, leaving the hand-written prose alone.
 *
 * Blocks are delimited in the markdown by:
 *
 *   <!-- AUTO:key -->
 *   ...generated...
 *   <!-- /AUTO:key -->
 *
 * Keys: last-updated | results | table | fixtures
 *
 * Output is deterministic — identical data produces byte-identical markdown,
 * so the weekly pipeline only commits the guide when something actually moved.
 *
 * Standalone: node scripts/generate-season-guide.mjs
 * Pipeline:    after generate-previews.mjs (report + preview slugs must exist)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "src", "data");
const NEWS = resolve(ROOT, "src", "content", "news");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const gc = readJson(resolve(DATA, "gamechangers.json"));
const tableMeta = readJson(resolve(DATA, "table.json"));
const standings = readJson(resolve(DATA, "standings.json"));
const fixtures = readJson(resolve(DATA, "fixtures.json"));

// ── helpers ─────────────────────────────────────────────────────────────────

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve"];
const countWord = (n) => NUM_WORDS[n] ?? String(n);

const stripHtml = (v) => String(v ?? "").replace(/<[^>]*>/g, "").trim();

function parseDate(value) {
  const d = new Date(stripHtml(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function longDate(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return stripHtml(value);
  return d.toLocaleDateString("en-GB", {
    ...opts,
    timeZone: "UTC",
  });
}

const weekday = (value) => longDate(value, { weekday: "long" });

function minutesOf(value) {
  const m = stripHtml(value).match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
}

const displayTime = (value) => {
  const t = stripHtml(value);
  return /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : "—";
};

const hasTime = (value) => /^\d{1,2}:\d{2}/.test(stripHtml(value));

/** "Monday 26 October 2026", or null when the source has no usable date. */
function fullDate(value) {
  if (!parseDate(value)) return null;
  return `${weekday(value)} ${longDate(value, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

/**
 * Set (or replace) a top-level frontmatter field without touching the rest of
 * the YAML. Keeps `updated:` in sync so <lastmod> and JSON-LD dateModified
 * reflect the refresh rather than the original publication date.
 */
function setFrontmatterField(src, key, value) {
  const m = src.match(/^---(\r?\n)([\s\S]*?)\r?\n---/);
  if (!m) return src;

  const eol = m[1] === "\r\n" ? "\r\n" : "\n";
  const fm = m[2];
  const line = `${key}: ${value}`;
  const keyRe = new RegExp(`^${key}:.*$`, "m");

  let nextFm;
  if (keyRe.test(fm)) {
    nextFm = fm.replace(keyRe, line);
  } else if (/^date:.*$/m.test(fm)) {
    nextFm = fm.replace(/^(date:.*)$/m, `$1${eol}${line}`);
  } else {
    nextFm = `${fm}${eol}${line}`;
  }

  return `---${eol}${nextFm}${eol}---${src.slice(m[0].length)}`;
}

// ── resolve current season ──────────────────────────────────────────────────

const season =
  fixtures.upcoming?.[0]?.season ??
  Math.max(...Object.keys(gc.seasons).map(Number));

const matches = gc.seasons[String(season)]?.matches ?? [];

if (!matches.length) {
  console.warn(`⚠️  No match data for Season ${season} — guide left untouched.`);
  process.exit(0);
}

const guidePath = resolve(NEWS, `baller-league-season-${season}-guide.md`);

if (!existsSync(guidePath)) {
  console.warn(`⚠️  Guide not found at ${guidePath} — skipped.`);
  process.exit(0);
}

// ── compute standings (mirrors src/lib/league.ts) ───────────────────────────
// W/D/L/GF/GA/GD come from raw match results; EP is the only non-derivable
// value and is read from table.json (synced by scrape-standings.mjs).

const rows = new Map();

function ensure(name, slug) {
  if (!rows.has(slug)) {
    rows.set(slug, { name, slug, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  }
  return rows.get(slug);
}

for (const m of matches) {
  const home = ensure(m.homeTeam, m.homeSlug);
  const away = ensure(m.awayTeam, m.awaySlug);

  home.p += 1;
  away.p += 1;
  home.gf += m.homeScore;
  home.ga += m.awayScore;
  away.gf += m.awayScore;
  away.ga += m.homeScore;

  if (m.homeScore > m.awayScore) {
    home.w += 1;
    away.l += 1;
  } else if (m.homeScore < m.awayScore) {
    away.w += 1;
    home.l += 1;
  } else {
    home.d += 1;
    away.d += 1;
  }
}

const epBySlug = new Map();
for (const row of tableMeta) epBySlug.set(row.slug, Number(row.ep) || 0);
for (const row of standings[String(season)] ?? []) {
  if (!epBySlug.has(row.slug)) epBySlug.set(row.slug, Number(row.ep) || 0);
}

const table = [...rows.values()]
  .map((r) => {
    const gd = r.gf - r.ga;
    const ep = epBySlug.get(r.slug) ?? 0;
    return { ...r, gd, ep, pts: r.w * 3 + r.d + ep };
  })
  .sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name)
  );

// ── latest completed gameweek ───────────────────────────────────────────────

const latestGW = Math.max(...matches.map((m) => m.gameweek));
const gwMatches = matches
  .filter((m) => m.gameweek === latestGW)
  .sort((a, b) => minutesOf(a.matchTime) - minutesOf(b.matchTime));

const gwDate = gwMatches[0]?.matchDate;

// ── next fixtures ───────────────────────────────────────────────────────────

const upcoming = fixtures.upcoming ?? [];
const nextGW = upcoming.length
  ? Math.min(...upcoming.map((u) => u.gameweek))
  : null;
const nextFixtures = upcoming
  .filter((u) => u.gameweek === nextGW)
  .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));

// ── block builders ──────────────────────────────────────────────────────────

function buildLastUpdated() {
  const stamp = fullDate(gwDate);
  return stamp
    ? `*Last updated: ${stamp}, after Gameweek ${latestGW}.*`
    : `*Last updated after Gameweek ${latestGW}.*`;
}

function buildResults() {
  const playedOn = fullDate(gwDate) ?? `Gameweek ${latestGW}`;
  const lines = [
    `## Latest results — Gameweek ${latestGW}`,
    "",
    `${countWord(gwMatches.length).replace(/^./, (c) => c.toUpperCase())} ${
      gwMatches.length === 1 ? "match was" : "matches were"
    } played on **${playedOn}**.`,
    "",
    "| Time | Result | Report |",
    "|---|---|---|",
  ];

  for (const m of gwMatches) {
    const base = `${m.homeSlug}-vs-${m.awaySlug}-gw${latestGW}`;
    const matchHref = `/match/s${season}-${base}`;
    const hasReport = existsSync(resolve(NEWS, `${base}.md`));
    const report = hasReport ? `[Report](/news/${base})` : "—";
    lines.push(
      `| ${displayTime(m.matchTime)} | [${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}](${matchHref}) | ${report} |`
    );
  }

  lines.push(
    "",
    `Every match page carries the full Gamechanger breakdown. Prefer a summary? Read the [Gameweek ${latestGW} roundup](/roundup/${latestGW}).`
  );

  return lines.join("\n");
}

function buildTable() {
  const lines = [
    "## League table",
    "",
    `After Gameweek ${latestGW}. EP = Extra Points from the Pressure Point challenge.`,
    "",
    "| Pos | Team | P | W | D | L | GD | EP | Pts |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  table.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | [${r.name}](/teams/${r.slug}) | ${r.p} | ${r.w} | ${r.d} | ${r.l} | ${signed(r.gd)} | ${r.ep} | ${r.pts} |`
    );
  });

  lines.push(
    "",
    "The [live league table](/table) is recomputed after every matchday."
  );

  return lines.join("\n");
}

function buildFixtures() {
  if (!nextFixtures.length) {
    return [
      "## Next fixtures",
      "",
      "The regular season is complete — check the [league table](/table) for the final standings and the [Final Four](/final-four) page for the playoffs.",
    ].join("\n");
  }

  const date = fullDate(nextFixtures[0].date);
  const kickOff = hasTime(nextFixtures[0].time)
    ? `, kicking off from ${displayTime(nextFixtures[0].time)}`
    : "";
  const when = date
    ? `${
        nextFixtures.length === 1 ? "The match is" : "All six matches are"
      } on **${date}**${kickOff}.`
    : null;

  const lines = [
    `## Next fixtures — Gameweek ${nextGW}`,
    "",
    ...(when ? [when, ""] : []),
    "| Time | Fixture | Preview |",
    "|---|---|---|",
  ];

  for (const f of nextFixtures) {
    const base = `${f.homeSlug}-vs-${f.awaySlug}-gw${f.gameweek}`;
    const hasPreview = existsSync(resolve(NEWS, `${base}-preview.md`));
    const preview = hasPreview ? `[Preview](/news/${base}-preview)` : "—";
    lines.push(
      `| ${displayTime(f.time)} | ${f.homeTeam} vs ${f.awayTeam} | ${preview} |`
    );
  }

  lines.push(
    "",
    "The [fixtures page](/fixtures) carries the full season schedule and kick-off times."
  );

  return lines.join("\n");
}

// ── apply blocks ────────────────────────────────────────────────────────────

const before = readFileSync(guidePath, "utf8");
let src = before;
const applied = [];
const missing = [];

// Keep the file's existing line ending so Windows checkouts (CRLF) don't end
// up with mixed endings after a regeneration.
const EOL = before.includes("\r\n") ? "\r\n" : "\n";

function apply(key, body) {
  const re = new RegExp(
    `<!-- AUTO:${key} -->[\\s\\S]*?<!-- /AUTO:${key} -->`
  );
  if (!re.test(src)) {
    missing.push(key);
    return;
  }
  const block = body.trim().replace(/\n/g, EOL);
  src = src.replace(
    re,
    `<!-- AUTO:${key} -->${EOL}${block}${EOL}<!-- /AUTO:${key} -->`
  );
  applied.push(key);
}

apply("last-updated", buildLastUpdated());
apply("results", buildResults());
apply("table", buildTable());
apply("fixtures", buildFixtures());

// Keep the article's freshness metadata aligned with the blocks above.
const updatedIso = parseDate(gwDate)?.toISOString().slice(0, 10);
if (updatedIso) src = setFrontmatterField(src, "updated", updatedIso);

if (!applied.length) {
  console.warn(
    `⚠️  No AUTO markers found in baller-league-season-${season}-guide.md — skipped.`
  );
  process.exit(0);
}

if (missing.length) {
  console.warn(`⚠️  Missing AUTO markers: ${missing.join(", ")}`);
}

if (src === before) {
  console.log(
    `✓ Season ${season} guide already current (Gameweek ${latestGW})`
  );
  process.exit(0);
}

writeFileSync(guidePath, src, "utf8");
console.log(
  `✓ Season ${season} guide refreshed — Gameweek ${latestGW} results, table, Gameweek ${nextGW ?? "-"} fixtures`
);
