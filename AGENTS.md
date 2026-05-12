# Baller League UK Hub — Project Guide

## Overview

A static Astro website providing stats, tables, teams, players, gamechanger analysis, and news for Baller League UK — a 6v6 celebrity football league. Hosted on Netlify at `ballerleagueukhub.com`.

**Tech stack:** Astro 4 (SSG), vanilla CSS, GitHub + Netlify CI/CD

---

## Weekly Update Guide (user-facing)

### Every gameweek:

**Step 1 — Update fixtures (MANUAL)**
Edit `src/data/fixtures.json` with next gameweek's fixtures. The Baller League site usually posts them mid-week. Format:
```json
{
  "upcoming": [
    {
      "gameweek": 11,
      "homeTeam": "NDL FC",
      "homeSlug": "ndl-fc",
      "homeEmoji": "🏆",
      "awayTeam": "SDS FC",
      "awaySlug": "sds-fc",
      "awayEmoji": "🟢",
      "date": "18 May 2026",
      "time": "18:00"
    }
    // ... 6 fixtures total
  ],
  "results": []
}
```

**Step 2 — Run the update**
```bash
npm run update
```
This scrapes ALL fresh data, regenerates match reports and previews, builds the site. Takes ~2-3 minutes.

**Step 3 — Preview locally (optional)**
```bash
npm run dev
```
Opens dev server at `http://localhost:4321`. Check the site looks right.

**Step 4 — Deploy**
```bash
git add -A
git commit -m "GW{week} update"
git push
```
Netlify auto-deploys on push. Site goes live in ~2 minutes.

### If something goes wrong:

- **Stale data?** Delete `scripts/.cache/*.html` and re-run `npm run update`
- **Player stats wrong?** Delete `scripts/.cache-players/player-*.html` and re-run `npm run update`
- **Missing matches?** Game IDs may have gone beyond 350 (the scan ceiling). Increase it in `scripts/scrape.mjs` (search for `350`).
- **Site broken?** Run `npm run build` directly to see the error, then run `npm run dev` to debug.

---

## Project structure

```
bluk-hub/
├── astro.config.mjs          # Site config: URL, output mode (static)
├── netlify.toml              # Netlify build settings
├── package.json              # Dependencies + scripts
├── AGENTS.md                 # This file
├── public/                   # Static files served as-is
│   ├── ads.txt               # Google AdSense publisher file
│   ├── robots.txt            # SEO: crawl rules + sitemap link
│   ├── favicon.svg
│   ├── logo.svg
│   ├── logos/                # Team logo SVGs
│   ├── managers/             # Manager headshot images
│   ├── players/              # Player headshot images
│   └── google*.html          # Google Search Console verification
├── scripts/                  # Build-time data pipeline
│   ├── scrape.mjs            # Scrapes match results → gamechangers.json
│   ├── scrape-ep.mjs         # Scrapes EP values → table.json
│   ├── scrape-players.mjs    # Scrapes player stats (via AJAX) → players.json
│   ├── generate-reports.mjs  # Generates rich match reports → content/news/
│   ├── generate-previews.mjs # Generates fixture previews → content/news/
│   ├── generate-og.mjs       # Generates OG image → dist/
│   ├── generate-sitemap.mjs  # Generates sitemap.xml → dist/
│   ├── update.mjs            # Master pipeline: runs all of the above + build
│   ├── .cache/               # HTTP cache for match page scraping
│   └── .cache-players/       # HTTP cache for player page scraping (main + AJAX)
├── src/
│   ├── components/           # Reusable Astro components
│   │   ├── Nav.astro         # Navigation bar
│   │   ├── Footer.astro      # Footer
│   │   ├── TeamCard.astro    # Team card component
│   │   ├── PlayerCard.astro  # Player card component
│   │   └── NewsCard.astro    # News card component
│   ├── layouts/
│   │   └── Base.astro        # Root layout: <html>, <head>, SEO meta, JSON-LD schemas, AdSense
│   ├── pages/                # Routes (file-based routing)
│   │   ├── index.astro       # Homepage (mini table, recent results, upcoming, news)
│   │   ├── table.astro       # League table + fixtures + results (client-side GW nav)
│   │   ├── roundup/[gw].astro # Per-gameweek roundup (SSG: 1 page per GW)
│   │   ├── roundup/index.astro # Redirect to latest GW
│   │   ├── teams/[slug].astro # Team detail (hero, form bar, stats cards, results grid, mini table, squad)
│   │   ├── teams/index.astro  # All teams overview
│   │   ├── players/[slug].astro # Player detail page (~162 pages)
│   │   ├── players/index.astro  # All players + leaderboard
│   │   ├── news/[slug].astro   # News article page (match reports + previews)
│   │   ├── news/index.astro    # All news listing
│   │   ├── match/[slug].astro  # Match detail page — descriptive slug: /match/s3-ndl-fc-vs-gold-devils-fc-gw10/
│   │   ├── rules.astro         # Rules & format guide
│   │   ├── gamechangers.astro  # Gamechanger analysis (client-side charts + tables)
│   │   ├── h2h.astro           # Head-to-head comparison tool
│   │   ├── watch.astro         # Where to watch
│   │   ├── compare.astro       # Redirect to rules
│   │   └── 404.astro           # 404 page
│   ├── data/                 # JSON data files (auto-generated or manual)
│   │   ├── gamechangers.json # All match results across seasons (AUTO — scrape.mjs)
│   │   ├── players.json      # Player stats: goals, assists, apps (AUTO — scrape-players.mjs)
│   │   ├── table.json        # Standings — EP values only (AUTO — scrape-ep.mjs)
│   │   └── fixtures.json     # Upcoming fixtures (MANUAL — update weekly)
│   ├── content/              # Markdown content collections
│   │   ├── news/             # Auto-generated match reports + previews
│   │   ├── teams/            # Team profiles (written content — static)
│   │   ├── players/          # Player profiles (written content — static)
│   │   └── config.ts         # Content collection definitions
│   └── styles/
│       └── global.css        # Global styles + CSS custom properties
└── dist/                     # Build output (gitignored, deployed to Netlify)
```

---

## Data flow

```
ballerleague.uk (official site)
    ↓  scrape.mjs (scans game IDs 1-350, caches pages)
gamechangers.json ────────────→ table.astro (computed W/D/L/GF/GA/PTS)
    │                              ↓
    │                         index.astro (mini table, recent results)
    │                              ↓
    │                         teams/[slug].astro (form, results, stats cards, mini table)
    │
    ├──→ roundup/[gw].astro (per-GW results + top performers)
    ├──→ match/[slug].astro (scorecard, GC analysis, match report link, prev/next nav)
    ├──→ players/index.astro (leaderboards — goals, assists, appearances, GC goals)
    ├──→ gamechangers.astro (frequency, sequences, ratios, charts — all client-side)
    └──→ h2h.astro (featured rivalry + comparison tool)

ballerleague.uk (official site)
    ↓  scrape-ep.mjs
table.json (EP values only — W/D/L/GF/GA/PTS computed from gamechangers.json)

ballerleague.uk (official site)
    ↓  scrape-players.mjs (main page + AJAX endpoint for S3 stats)
players.json ────────────────→ players/[slug].astro (goals, assists, apps, detailed stats)
    │                              ↓
    │                         players/index.astro (leaderboard)
    │                              ↓
    │                         teams/[slug].astro (squad table sorted by goals)
    │
    ├──→ generate-reports.mjs ──→ content/news/*.md → news/[slug].astro
    └──→ generate-previews.mjs ──→ content/news/*.md (reads from fixtures.json)
```

---

## Key technical details

### Scraping pipeline (`npm run update`)

Runs in order:
1. **scrape.mjs** — Scans `ballerleague.uk/en/game/{id}` for IDs 1-350. Finds UK matches by detecting 2+ team names near the score. Parses: scores, gameweek, teams, Game Changer activations, goal timeline, per-match player stats, goalscorers. Output: `gamechangers.json`.
   - Season detection: ID >= 145 → S3, ID >= 73 → S2, else → S1
   - Goal detection: catches "Goal", "Penalty", and "Own Goal" labels
   - Cache: `scripts/.cache/{id}.html` — old GWs load instantly, new GWs fetch fresh
   - Scan ceiling: 350 (edit if new gameweeks push IDs higher)
2. **scrape-ep.mjs** — Fetches the official standings page, extracts EP values per team. Output: `table.json`.
3. **scrape-players.mjs** — Discovers players from `/en/players?page={n}`, then fetches each player page AND an AJAX endpoint (`/ajax/player/{slug}/stats/{seasonId}`) for correct S3 stats. Output: `players.json`.
   - Cache: `scripts/.cache-players/player-{slug}.html` and `player-{slug}-s3.html`
4. **generate-reports.mjs** — Generated rich, narrative match reports with varied templates, player-centric storytelling, tactical commentary. Output: `content/news/{homeSlug}-vs-{awaySlug}-gw{gw}.md`.
5. **generate-previews.mjs** — Creates fixture previews from `fixtures.json`. Output: `content/news/{homeSlug}-vs-{awaySlug}-gw{gw}-preview.md`.
6. **generate-og.mjs** — Generates Open Graph image. Output: `dist/og-default.png`.
7. **astro build** + **generate-sitemap.mjs** — Builds static site to `dist/`, then crawls it for sitemap.xml.

### Cache policy
- Match and player page caches are NOT cleared on each run (unlike the old behavior). Old GW data is final and loads from cache instantly. New GW pages cache-bust automatically because they don't exist in cache yet.
- If you need a full re-scrape: delete `scripts/.cache/*.html` and `scripts/.cache-players/player-*.html` before running.

### Standings computation
W/D/L/GF/GA/GD/PTS are **automatically computed** from match data in `gamechangers.json` at build time. Only EP (Extra Points) is scraped from the official site into `table.json`. Everything else in `table.json` is overridden during the build.

### Player stats — AJAX endpoint
The Baller League player pages load Season 3 stats via JavaScript (AJAX). The scraper (`scrape-players.mjs`) extracts the S3 season ID from the `<select>` dropdown and fetches the AJAX endpoint directly (`/ajax/player/{slug}/stats/{seasonId}`). This ensures accurate S3 stats (goals, assists, apps, detailed stats).

### Match URL slugs
Match pages use descriptive SEO-friendly slugs: `/match/s{season}-{homeSlug}-vs-{awaySlug}-gw{gw}/`. Example: `/match/s3-ndl-fc-vs-gold-devils-fc-gw10/`. All linking pages (homepage, table, roundup, team detail, h2h) generate these slugs consistently.

### Page auto-update status
All pages auto-update from scraped data with every `npm run update`. The only manual dependency is `fixtures.json` for the "Upcoming Fixtures" section on the homepage and league table.

### SEO
- Structured data (JSON-LD) on every page: WebSite, SportsOrganization, SportsTeam, Person (`SportsEvent` for match pages)
- BreadcrumbList injected via client-side JS on every page
- Auto-generated sitemap.xml with ~378 URLs, proper priorities and change frequencies
- Google Search Console verified (`google*.html` in `public/`)
- Meta keywords, descriptions, OG/Twitter cards, canonical URLs on every page
- `robots.txt` references sitemap, allows all crawlers
- Match pages have descriptive keyword-rich slugs for search engines

### AdSense
AdSense script in `Base.astro` with publisher ID `ca-pub-7873503560434517`. `ads.txt` in `public/`.

### Domain
Primary domain: `ballerleagueukhub.com` (configured in `astro.config.mjs`). Netlify handles SSL.

---

## Available commands

| Command | Purpose |
|---------|---------|
| `npm run update` | Full weekly pipeline: scrape → generate → build |
| `npm run dev` | Dev server at `http://localhost:4321` |
| `npm run build` | Build dist/ + sitemap |
| `npm run preview` | Preview built site |
| `node scripts/scrape.mjs` | Scrape match results only |
| `node scripts/scrape-ep.mjs` | Scrape EP values only |
| `node scripts/scrape-players.mjs` | Scrape player stats only |
| `node scripts/generate-reports.mjs` | Generate match reports only |
| `node scripts/generate-previews.mjs` | Generate fixture previews only |
