# Baller League UK Hub — Project Guide

## Overview

A static Astro website providing stats, tables, teams, players, gamechanger analysis, and news for Baller League UK — a 6v6 celebrity football league. Hosted on Netlify at `ballerleagueukhub.com`.

**Tech stack:** Astro 4 (SSG), vanilla CSS, GitHub + Netlify CI/CD

---

## Project structure

```
bluk-hub/
├── astro.config.mjs          # Site config: URL, output mode (static)
├── netlify.toml              # Netlify build settings
├── package.json              # Dependencies + scripts
├── tsconfig.json
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
│   ├── scrape-players.mjs    # Scrapes player stats → players.json
│   ├── scrape-assets.mjs     # Scrapes team logo SVGs → public/logos/
│   ├── generate-reports.mjs  # Generates match report .md → content/news/
│   ├── generate-previews.mjs # Generates fixture preview .md → content/news/
│   ├── generate-sitemap.mjs  # Generates sitemap.xml → dist/
│   ├── update.mjs            # Master pipeline: runs all of the above + build
│   ├── .cache/               # HTTP cache for match page scraping
│   └── .cache-players/       # HTTP cache for player page scraping
├── src/
│   ├── components/           # Reusable Astro components
│   │   ├── Nav.astro         # Navigation bar
│   │   ├── Footer.astro      # Footer
│   │   ├── TeamCard.astro    # Team card component
│   │   ├── PlayerCard.astro  # Player card component
│   │   └── NewsCard.astro    # News card component
│   ├── layouts/
│   │   └── Base.astro        # Root layout: <html>, <head>, SEO meta, schemas, analytics
│   ├── pages/                # Routes (file-based routing)
│   │   ├── index.astro       # Homepage
│   │   ├── table.astro       # League table + fixtures + results
│   │   ├── roundup/[gw].astro # Per-gameweek roundup (SSG: 1 page per GW)
│   │   ├── roundup/index.astro # Redirect to latest GW
│   │   ├── teams/[slug].astro # Team detail page (12 pages)
│   │   ├── teams/index.astro  # All teams overview
│   │   ├── players/[slug].astro # Player detail page (~180 pages)
│   │   ├── players/index.astro  # All players + leaderboard
│   │   ├── news/[slug].astro   # News article page
│   │   ├── news/index.astro    # All news listing
│   │   ├── match/[id].astro    # Match detail page (~105 pages)
│   │   ├── rules.astro         # Rules & format guide
│   │   ├── gamechangers.astro  # Gamechanger analysis
│   │   ├── h2h.astro           # Head-to-head comparison tool
│   │   ├── watch.astro         # Where to watch
│   │   ├── compare.astro       # Redirect to rules
│   │   └── 404.astro           # 404 page
│   ├── data/                 # JSON data files (auto-generated or manual)
│   │   ├── gamechangers.json # All match results across seasons (auto-scraped)
│   │   ├── players.json      # Player stats (auto-scraped)
│   │   ├── table.json        # Standings — EP values only (auto-scraped)
│   │   └── fixtures.json     # Upcoming fixtures (MANUAL — update weekly)
│   ├── content/              # Markdown content collections
│   │   ├── news/             # Auto-generated match reports + previews
│   │   ├── teams/            # Team profiles (written content)
│   │   ├── players/          # Player profiles (written content)
│   │   └── config.ts         # Content collection definitions
│   └── styles/
│       └── global.css        # Global styles + CSS custom properties
└── dist/                     # Build output (gitignored, deployed to Netlify)
```

---

## How to run

### Weekly update (full pipeline)
```
npm run update
```
This runs in order:
1. **scrape.mjs** — Scrapes match results from `ballerleague.uk/en/game/{id}` → `gamechangers.json`
2. **scrape-ep.mjs** — Extracts EP values from official standings → `table.json`
3. **scrape-players.mjs** — Scrapes player stats from Baller League site → `players.json`
4. **generate-reports.mjs** — Creates match report .md files → `content/news/`
5. **generate-previews.mjs** — Creates fixture preview .md files → `content/news/`
6. **astro build + generate-sitemap.mjs** — Builds static site → `dist/` + `sitemap.xml`

### Manual tasks each week
- Update `src/data/fixtures.json` with next gameweek's fixtures
- Run `npm run update`, then `git add . && git commit -m "GW{week} update" && git push`
- Netlify auto-deploys on push

### Dev server
```
npm run dev
```

### Individual scripts
```
node scripts/scrape.mjs          # Scrape match results only
node scripts/scrape-ep.mjs       # Scrape EP values only
node scripts/scrape-players.mjs  # Scrape player stats only
node scripts/generate-reports.mjs  # Generate match reports only
node scripts/generate-previews.mjs # Generate previews only
```

---

## Key technical details

### Static site + path-based routing
The site uses `output: 'static'` (SSG). **Query parameters do not work** on static sites. Instead, we use path-based routes with `getStaticPaths()`:

- Roundup: `/roundup/1`, `/roundup/2`, ... `/roundup/9` (one page per GW)
- Table results: Embedded all GW data in HTML, client-side JS switches visibility
- Match pages: `/match/1`, `/match/2`, ... `/match/105`
- Team pages: `/teams/ndl-fc`, `/teams/prime-fc`, etc.
- Player pages: `/players/john-doe`, etc.
- News pages: `/news/clutch-fc-vs-ndl-fc-gw7`, etc.

### Standings computation
W/D/L/GF/GA/GD/PTS are **automatically computed** from match data in `gamechangers.json`. Only EP (Extra Points) is scraped from the official site. The `table.json` file only needs EP values — everything else is overridden at build time.

### AdSense
AdSense script is in `Base.astro` with publisher ID `ca-pub-7873503560434517`. `ads.txt` is in `public/`.

### SEO
- Structured data (JSON-LD) on every page: WebSite, SportsOrganization, SportsTeam, Person, FAQPage, NewsArticle
- Auto-generated sitemap.xml with 364+ URLs
- Google Search Console verified
- Meta keywords, descriptions, OG/Twitter cards, canonical URLs on every page
- `robots.txt` with sitemap reference

### Domain
Primary domain: `ballerleagueukhub.com` (configured in `astro.config.mjs`)
Netlify handles SSL automatically.

---

## Data flow

```
ballerleague.uk (official site)
    ↓  (scrape.mjs)
gamechangers.json ────────────→ table.astro (computed W/D/L/GF/GA/PTS)
    ↓                              ↓
    ↓                         index.astro (mini table)
    ↓
    ├──→ roundup/[gw].astro (per-GW results)
    ├──→ match/[id].astro (match details)
    ├──→ teams/[slug].astro (team form + history)
    └──→ h2h.astro (head-to-head)

ballerleague.uk (official site)
    ↓  (scrape-ep.mjs)
table.json (EP values only)

ballerleague.uk (official site)
    ↓  (scrape-players.mjs)
players.json ────────────────→ players/[slug].astro
    ↓
generate-reports.mjs ────────→ content/news/*.md → news/[slug].astro
generate-previews.mjs ───────→ content/news/*.md → news/[slug].astro
```

---

## Stale cache warning
The scrape script caches HTTP responses in `scripts/.cache/`. If match pages were previously fetched as 0-0 (upcoming), the cached version will be used and scores won't update. The `update.mjs` script auto-clears the cache before each run. If running `scrape.mjs` individually, delete `scripts/.cache/*` first.
