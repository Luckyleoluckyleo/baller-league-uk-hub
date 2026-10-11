# Baller League UK Hub — Project Guide

## Overview

A static Astro website providing stats, tables, teams, players, gamechanger analysis, and news for Baller League UK — a 6v6 celebrity football league. Hosted on Netlify at `ballerleagueukhub.com`.

**Tech stack:** Astro 4 (SSG), vanilla CSS + vanilla JS, `sharp` for OG image generation, GitHub + Netlify CI/CD.

> **No frontend framework and no chart library.** All interactivity (GW nav, season tabs, h2h picker, player search/sort, frequency tables) is hand-written inline `<script>`. Do not add React/Vue/Chart.js — match the existing style.

---

## Current state / handover

- **Phase: Season 4 is live.** `ballerleague.uk` now serves **Season 4** — squads, managers and the GW1 fixtures are all published. The site has been onboarded: `fixtures.json.upcoming` holds the S4 GW1 fixtures (so `generate-previews.mjs` works again), `table.json`/`standings.json` carry the S4 12-team line-up, and `players.json` was re-scraped across all seasons. Season detection is date-based, so S4 match data auto-detects once games are played.
- **S4 line-up changes:** `Yanited → RTG FC` (id 330, Danny Aarons), `Rukkas FC → P17 FC` (id 344, Alex Iwobi), new **Toma** (id 348, Jay-Jay Okocha). Slugs stay legacy (`yanited`, `rukkas-fc`); canonical display names are the current S4 names. M7/Community are historical only.
- **S4 intake** lives in `src/data/season4.json` (now confirmed/live) and is surfaced on `/season-4` + the S4 editorial articles.
- **Data correctness is enforced by `node scripts/verify-data.mjs`** — it must print `✅ PASS`. Run it after any data/scrape change.
- **Environment quirks (Windows):** `npm.ps1` is blocked by execution policy → use **`npm.cmd`**; likewise `npx.cmd`. A preview server may be running on `:4322` (something else holds `:4321`). `git push` writes progress to stderr, which PowerShell renders as red text — it still succeeds; confirm with `git status -sb`.
- **Recent uncommitted-work habit:** generated content under `src/content/news/` matching `*-gw{n}.md` / `*-preview.md` is regenerated — never hand-edit those.

---

## Weekly Update Guide (user-facing)

### Every gameweek:

**Step 1 — Fixtures (AUTOMATIC)**
`scripts/scrape-fixtures.mjs` reads the next gameweek from `ballerleague.uk/en/matches` and writes `src/data/fixtures.json`. Slugs come straight from the match links (`.../game/214?season=season-4&gameday=1&team1=deportrio&team2=wembley-rangers-afc`); dates come from `season4.json`'s `matchdays`. It runs first in `npm run update`.

```json
{
  "upcoming": [
    {
      "gameweek": 2,
      "season": 4,
      "homeTeam": "NDL FC",
      "homeSlug": "ndl-fc",
      "homeEmoji": "🏆",
      "awayTeam": "SDS FC",
      "awaySlug": "sds-fc",
      "awayEmoji": "🟢",
      "date": "19 October 2026",
      "time": "17:30"
    }
  ],
  "results": []
}
```

Notes:
- Only `upcoming` drives generated content. `results[]` is currently read by **nothing** — see Known Issues.
- The page only server-renders the **current season's active gameweek**, and the season/date switchers are JS-only — so the scraper reads the default view. If the gameweek is already complete it logs "No upcoming fixtures found" and leaves `fixtures.json` unchanged.
- Run it standalone with `npm run fixtures`; debug against a saved page with `node scripts/scrape-fixtures.mjs --file <path>`.
- **Fallback:** if the scraper can't find fixtures, hand-edit `src/data/fixtures.json` as above (every `upcoming` entry now needs a `season` field).
- Knockout games use a `stage` field (`"Semi-Final"`, `"Final"`). Pages test for `.round`, not `.stage` — another Known Issue.

**Step 2 — Run the update**
```bash
npm run update
```
Scrapes upcoming fixtures + all fresh data, regenerates match reports/previews/OG images, builds the site. Takes ~2–3 minutes.

**Step 3 — Preview locally (optional)**
```bash
npm run dev
```
Dev server at `http://localhost:4321`.

**Step 4 — Deploy**
```bash
git add -A
git commit -m "GW{week} update"
git push
```
Netlify auto-deploys on push (~2 min).

### If something goes wrong:

| Symptom | Fix |
|---|---|
| Stale match data | Delete `scripts/.cache/*.html`, re-run `npm run update` |
| Wrong player stats | Delete `scripts/.cache-players/player-*.html`, re-run |
| Missing matches | Game IDs may have passed the scan ceiling of **450** (`scripts/scrape.mjs`, the `SCAN_MAX` constant) |
| Match reports missing for older seasons | `npm run update` now generates the **current season** automatically (from `fixtures.json.upcoming[0].season`). Use `node scripts/generate-reports.mjs --season=all` to (re)build every season |
| No previews generated | `scrape-fixtures` found no upcoming gameweek (current one complete) or `fixtures.json.upcoming` is empty |
| Build broken | `npm run build` directly for the real error, then `npm run dev` |
| OG image script crashes on `sharp` | `sharp` is undeclared in `package.json` — see Known Issues |

---

## Architecture: two stages

The pipeline splits cleanly into two halves that never talk to each other. Understanding this is the single most useful thing in this file.

```
STAGE 1 — SCRAPE (network I/O, cached, non-deterministic)
  ballerleague.uk
    ├─ scrape-fixtures.mjs → src/data/fixtures.json        (upcoming, live /en/matches)
    ├─ scrape.mjs          → src/data/gamechangers.json    (207 matches, 4 seasons)
    ├─ scrape-standings.mjs→ src/data/standings.json, table.json (ep)
    └─ scrape-players.mjs  → src/data/players.json         (all seasons)

STAGE 2 — GENERATE + BUILD (pure functions of the JSON, deterministic)
  generate-reports.mjs    → src/content/news/{h}-vs-{a}-gw{n}.md
  generate-previews.mjs   → src/content/news/{h}-vs-{a}-gw{n}-preview.md
  generate-og.mjs         → public/og-default.png
  generate-og-images.mjs  → public/og/{slug}.png
  astro build             → dist/  (also emits dist/lastmod.json — see A3)
  generate-redirects.mjs  → dist/_redirects      (post-build)
  generate-sitemap.mjs    → dist/sitemap.xml     (post-build, lastmod from lastmod.json)
  ping-indexnow.mjs       → POST to api.indexnow.org (post-build; never fails the run)
```

**Stage 1 is allowed to be wrong/temporary. Stage 2 is a pure function of Stage 1's output.** If you need to change how content reads, edit Stage 2. If you need different data, edit Stage 1.

`scripts/update.mjs` runs both stages in order (**16 stages**) and **fails fast** (`process.exit(1)` on first failure) — there is no partial-state recovery. The one exception is `ping-indexnow.mjs`, which swallows errors so a failed notification ping never breaks a deploy.

---

## Source of truth

> **`src/data/gamechangers.json` is authoritative.**

Every W/D/L/GF/GA/GD/PTS figure on the site is **recomputed at build time from raw match results** in `gamechangers.json`. Pages do their own local computation; there is no shared lib (see below).

`src/data/table.json` is **not** the league table. It is effectively:
1. A carrier for team metadata (`slug`, `emoji`) that pages need for lookups
2. A holder for `ep` (Extra Points), the one value that cannot be derived from match data

Everything else in `table.json` (`played`, `won`, `gf`, `pts`, …) is **stale by design** and gets overwritten in-page. This is why a `table.json` stuck at `played: 9` while the scraper holds 12 gameweeks does not break the site. **Do not "fix" table.json by hand** — edit the computation or the scraper instead.

Likewise `src/data/players.json` is a **separate scrape** from match data. It now captures **every season a player appears in** (S1–S4 as they become available); pre-S4 seasons are the only ones with played stats until S4 kicks off.

---

## Project structure

```
baller-league-uk-hub/
├── astro.config.mjs          # site: https://ballerleagueukhub.com, output: static
├── netlify.toml              # build cmd, NODE_VERSION=20, 2 static redirects
├── package.json              # scripts + deps
├── AGENTS.md                 # this file
├── tsconfig.json
├── public/
│   ├── ads.txt               # AdSense publisher file
│   ├── robots.txt
│   ├── favicon.svg, logo.svg
│   ├── og-default.svg/.png   # default OG (PNG is generated)
│   ├── og/                   # per-article OG images (86 PNGs, generated)
│   ├── logos/                # 12 team logo SVGs
│   ├── managers/             # 12 manager headshots (.webp)
│   ├── players/              # player headshots (.webp)
│   ├── admin/                # Decap CMS (index.html + config.yml)
│   └── google*.html          # Search Console verification
├── scripts/                  # 22 scripts — see Scripts reference
│   ├── update.mjs            # orchestrator (16 stages)
│   ├── scrape-fixtures.mjs   # upcoming fixtures from /en/matches
│   ├── scrape.mjs            # match results
│   ├── scrape-standings.mjs  # official standings + EP
│   ├── scrape-players.mjs    # player stats
│   ├── scrape-ep.mjs         # EP values  ⚠ superseded
│   ├── scrape-assets.mjs     # team logos  ⚠ NOT in pipeline
│   ├── generate-reports.mjs  # match reports (default: current season)
│   ├── generate-previews.mjs # fixture previews
│   ├── generate-team-previews.mjs # per-team season previews
│   ├── generate-player-spotlights.mjs # player spotlight articles
│   ├── generate-team-history.mjs # per-club all-time record pages
│   ├── generate-og.mjs       # default OG PNG
│   ├── generate-og-images.mjs# per-article OG PNGs
│   ├── generate-og-people.mjs# player + manager OG PNGs
│   ├── generate-placeholders.mjs # placeholder player images
│   ├── optimize-images.mjs   # resize player/manager images  ⚠ manual
│   ├── verify-data.mjs       # data verifier vs official
│   ├── generate-redirects.mjs# dist/_redirects  (post-build)
│   ├── generate-sitemap.mjs  # dist/sitemap.xml (post-build)
│   ├── ping-indexnow.mjs     # notify Bing/IndexNow  (post-build)
│   ├── season4-news.mjs      # S4 news monitor  ⚠ manual, not in pipeline
│   ├── .cache/               # gitignored — match page HTML + s4-seen.json
│   └── .cache-players/       # gitignored — player page HTML + AJAX
└── src/
    ├── components/           # Nav, Footer, Breadcrumb, TeamCard, PlayerCard,
    │                         #   NewsCard, StatStrip, StatLeaderboard, MiniLeaderboard
    ├── layouts/
    │   └── Base.astro        # <head>, SEO meta, JSON-LD, AdSense, skip-link
    ├── pages/                # 30 files — see Routes
    ├── lib/
    │   └── league.ts         # shared: CURRENT_SEASON, standingsFor, formFor, matchSlug
    ├── data/                 # the 6 JSON files that drive everything
    │   ├── gamechangers.json # AUTO — all matches, all seasons
    │   ├── players.json      # AUTO — player stats (all seasons, 146 players)
    │   ├── table.json        # AUTO (ep only) — team metadata carrier
    │   ├── standings.json    # AUTO — official final tables per season
    │   ├── fixtures.json     # MANUAL — upcoming + results
    │   └── season4.json      # MANUAL — Season 4 intake (dates/venue/managers/signings)
    ├── content/              # 4 collections
    │   ├── teams/    (12)    # hand-written profiles
    │   ├── players/  (44)    # hand-written profiles (bios shown on player pages)
    │   ├── managers/ (13)    # hand-written profiles
    │   ├── news/     (90)    # generated reports/previews + S4 articles + hand-written
    │   └── config.ts         # collection schemas
    └── styles/
        └── global.css        # design tokens, shared classes, a11y, responsive tables
```

### `src/lib/league.ts` — shared season/standings helper

Standings computation, the active-season constant, form guide, and match-slug construction live here and are imported by the current pages. Earlier this logic was duplicated inline in every page; new pages should import from `src/lib/league.ts` rather than copy it. Note the site is only **partly** migrated — some historical/analytics pages (`gamechangers`, `records`, `h2h`, `final-four`, `roundup`) still hardcode Season 3 and read `gcData.seasons['3']` directly.

---

## opencode automation

- **`/gw-update`** (`.opencode/command/gw-update.md`) — the weekly ritual: set `fixtures.json` → `npm run update` → `verify-data` → commit/push.
- **`baller-maintainer`** (`.opencode/agent/baller-maintainer.md`) — a project primary agent (Tab to switch) with the domain prompt + permissions.
- **Weekly GitHub Action** (`.github/workflows/weekly-s4-update.yml`) — Monday-night cron that runs `npm run update` and commits the result; uses the built-in `GITHUB_TOKEN` (`contents: write`), no secret required. Netlify deploys on the push.
- These files are **not** loaded until opencode restarts.

---

## Scripts reference

| Script | Reads | Writes | In `npm run update`? | Flags |
|---|---|---|---|---|
| `update.mjs` | — | — | entrypoint | — |
| `scrape-fixtures.mjs` | `/en/matches` (live, no cache) | `src/data/fixtures.json` (`upcoming`) | 1/16 | `--file <path>` |
| `scrape.mjs` | `scripts/.cache/{id}.html` (read-through) | `src/data/gamechangers.json` | 2/16 | — |
| `scrape-standings.mjs` | `gamechangers.json` + `/en/game/{id}` | `src/data/standings.json`, `table.json` (`ep`) | 3/16 | — |
| `scrape-players.mjs` | `scripts/.cache-players/` | `src/data/players.json` | 4/16 | — |
| `generate-placeholders.mjs` | `players.json`, `content/players/` | `public/players/*.webp` (missing only) | 5/16 | — |
| `generate-reports.mjs` | all data JSON | `src/content/news/{h}-vs-{a}-gw{n}.md` | 6/16 | `--season=all` (default: current season) |
| `generate-previews.mjs` | all data JSON | `src/content/news/{h}-vs-{a}-gw{n}-preview.md` | 7/16 | — |
| `generate-team-previews.mjs` | data JSON + `content/teams/` | `src/content/news/season-{n}-team-preview-*.md` | 8/16 | — |
| `generate-player-spotlights.mjs` | `content/players/` + `players.json` | `src/content/news/player-spotlight-*.md` | 9/16 | — |
| `generate-team-history.mjs` | `gamechangers.json` + `standings.json` | `src/content/news/baller-league-team-history-*.md` | 10/16 | — |
| `generate-og.mjs` | `public/og-default.svg` | `public/og-default.png` | 11/16 | — |
| `generate-og-images.mjs` | `src/content/news/*.md` | `public/og/{slug}.png` | 12/16 | — |
| `generate-og-people.mjs` | `players.json`, managers | `public/og/players/*.png`, `public/og/managers/*.png` | 13/16 | — |
| `verify-data.mjs` | `gamechangers.json`, `players.json`, `standings.json` | stdout (exits 1 on mismatch) | 14/16 | season filter (e.g. `1 2 3`); no args = all seasons |
| `generate-redirects.mjs` | `gamechangers.json` | `dist/_redirects` | via build | — |
| `generate-sitemap.mjs` | `dist/**`, `dist/lastmod.json` | `dist/sitemap.xml` | via build | — |
| `ping-indexnow.mjs` | `dist/sitemap.xml` | POST to `api.indexnow.org` | 16/16 | — |
| `optimize-images.mjs` | `public/players`, `public/managers`, `public/teams` | resized `.webp` | **⚠ NO — manual only** | — |
| `scrape-ep.mjs` | `scripts/.cache/*.html`, `table.json` | `src/data/table.json` (`ep` only) | **⚠ superseded by `scrape-standings.mjs`** | — |
| `scrape-assets.mjs` | — | `public/logos/{slug}.svg` | **⚠ NO — manual only** | — |
| `season4-news.mjs` | Google News RSS | stdout + `scripts/.cache/s4-seen.json` | **⚠ NO — manual monitor** | `--all`, `--days=N` |

**`generate-reports.mjs` now defaults to the current season** (from `fixtures.json.upcoming[0].season`), so the weekly pipeline regenerates the live season's reports unattended; `--season=all` still rebuilds every season (⚠ drops colliding slugs). `verify-data.mjs` accepts optional season numbers; `scrape-fixtures.mjs` accepts `--file <path>`; `season4-news.mjs` accepts `--all` / `--days=N`. No script reads `process.env`.

### Cache policy
- `scripts/.cache/{id}.html` — match pages. Cache clearing is **deliberately commented out** in `update.mjs`. Old gameweeks are final and load instantly; new gameweeks aren't in cache so they fetch live. No invalidation, ever.
- `scripts/.cache-players/` — three cache types: `list-page-{n}.html`, `player-{slug}.html`, `player-{slug}-s{n}.html`. Same no-invalidation policy; **clear it when the season changes**.
- `scrape-fixtures.mjs` keeps **no cache** — `/en/matches` is a live list that changes weekly, so it always fetches fresh.
- `scrape-ep.mjs` has no cache of its own — it *consumes* `scrape.mjs`'s cache. It is **superseded by `scrape-standings.mjs`** (which also captures historical seasons) and is no longer in the pipeline.

### Scrape mechanics worth knowing
- **Match ID scan:** `ballerleague.uk/en/game/{id}` for IDs 1–450, in batches of 10 via `Promise.all`, 100 ms between batches. A page is a UK match if its header has **two recognised team names** (matched via the `bl-gameday-team-name` blocks; the `logo_{id}.svg` is a fallback since some logos come from a CDN without an id). HTTP 302 is followed by recursing into the `location` header's game ID.
- **Teams are franchises keyed by official id/name, not display name.** The same franchise is renamed between seasons (`MVPs United`→`Prime`, `26ers`→`Gold Devils`, `Trebol FC`→`NDL`, `Santan FC`→`Clutch`, `F.C RTW`→`Rukkas`); `TEAMS` in `scrape.mjs` maps every historical name to one slug. `homeName`/`awayName` keep the season-accurate label; `homeTeam` is the canonical site name.
- **Season detection is by match date:** two seasons per year — spring (Mar–Jun) and autumn (Sep–Feb). `S1=2025 spring, S2=2025 autumn (→Jan 2026), S3=2026 spring, S4=2026 autumn…`. Falls back to id ranges (`>=145`→S3, `>=70`→S2, else S1) when a date is missing.
- **Goal detection** catches `Goal`, `Penalty`, and `Own Goal` timeline labels; GC goals come from `⚽` minute markers (12–15 min = first-half GC, 27–29 = second-half GC). GC labels are normalised via `GC_MAP` (`1v1`→`1on1`, `Fair Play`→`fairplay`, …).
- **Player stats** are parsed per row from `#player-stats-container` (`G, A, S, T, PTY, R, C, P`). Tier-A extras (shots/passes/tackles/saves) come from `players.json`'s `detailed` map.
- **`scrape-players.mjs` must hit the AJAX endpoint.** Player pages load per-season stats via JavaScript; the scraper reads every `<option>Season N</option>` from the season `<select>` and fetches `/ajax/player/{slug}/stats/{seasonId}` for each, storing them all under `seasons[N]`. Skipping this yields wrong stats. Team is read from the page's `data-current-team` JSON (falling back to the `logo_{id}` map). The player-page cache must be cleared (`scripts/.cache-players/`) when the season changes, since it never auto-invalidates.
- **`scrape-standings.mjs` is season-agnostic:** it reads the latest `gameId` per season from `gamechangers.json`, fetches that game page's `STANDINGS` table, writes `standings.json`, and syncs `table.json` EP. New seasons are picked up automatically. It **merges** into `standings.json` (rather than overwriting), so a current season that has fixtures but no played games yet keeps its seeded entry; EP sync targets the **current season** (`fixtures.json.upcoming[0].season`), not merely the newest scraped one.

---

## Data files

### `src/data/gamechangers.json` — `{ definitions, seasons }`
207 matches: **S1 = 69, S2 = 69, S3 = 69** (GWs 1–12 each; GW12 = Final Four, 3 games).

```jsonc
{
  "definitions": { "firstHalf": [...], "secondHalf": [...] },  // 6 GC definitions
  "seasons": {
    "3": {
      "label": "Season 3", "labelShort": "S3",
      "matches": [{
        "gameweek": 1,
        "homeTeam": "Yanited", "homeSlug": "yanited", "homeEmoji": "👑",
        "awayTeam": "N5 FC",    "awaySlug": "n5-fc",    "awayEmoji": "5️⃣",
        "homeScore": 7, "awayScore": 2,
        "gamechanger1": { "type": "plusone", "goalsScored": 3 },
        "gamechanger2": { "type": "theline", "goalsScored": 1 },
        "playerStats": [{ "name": "...", "team": "sds-fc", "goals": 2, "assists": 0, "...": 0 }],
        "goalscorers":  [{ "minute": 29, "player": "Tyler Winters" }],
        "matchDate": "24 Mar 2026",
        "matchTime": "17:35"
      }]
    }
  }
}
```

Gotchas:
- `playerStats[].team` is a **slug**; `goalscorers[]` has **no team field** — downstream must infer the scorer's side.
- GC types are `onside` | `plusone` | `3play` (first half), `1on1` | `theline` | `fairplay` (second half), or `unknown`.
- **GW11 + GW12 (Final Four / playoffs) are `type: "unknown"`** in both halves — those matches legitimately have no Game Changer. Several scripts and pages special-case this with a `|| m.gameweek === 12` carve-out.
- GW12 packs **both semi-finals and the Final** into `gameweek: 12` with no `stage` field. Stage info lives only in `fixtures.json`.
- `matchTime` can contain raw HTML from the source site.

### `src/data/players.json` — `{ players: [...] }`
146 players. Fields: `slug`, `name`, `team`, `teamSlug`, `position`, `age`, `number`, `seasons: { "4": {...}, "3": {...}, ... }`.
- **Any season a player appears in** becomes a key (`seasons["1"]`…`seasons["4"]`). Each has `{ apps, goals, assists, detailed: {...} }`.
- `detailed` has ~16–23 keys per player and the set varies per player — it is not a fixed schema. Keys are scraped verbatim, so one contains an un-decoded `&amp;` entity.
- `age` is `null` for all players (upstream regex never matches).

### `src/data/table.json` — array of 12
```jsonc
{ "pos": 1, "team": "NDL FC", "slug": "ndl-fc", "emoji": "🏆",
  "played": 9, "won": 6, "drawn": 2, "lost": 1,
  "gf": 44, "ga": 30, "gd": 14, "ep": 0, "pts": 20 }
```
See **Source of truth** above. For the current season it carries the correct final table (EP synced by `scrape-standings.mjs`).

### `src/data/standings.json` — `{ "1": [...], "2": [...], "3": [...] }`
Official final table per season (one entry per team: `teamId, pos, team, slug, played, won, drawn, lost, gd, ep, pts`), captured by `scrape-standings.mjs`. This is the authoritative source for historical EP and is read by `verify-data.mjs` and the season pages.

### `src/data/fixtures.json` — `{ upcoming, results }`
Currently `upcoming: []` and `results` holds the 3 GW12 knockout games with a `stage` field.

### `src/data/season4.json` — MANUAL Season 4 intake
Hand-maintained notes for the upcoming season: `dates`, `venue`, `format`, `matchdays`, `managers`, `teamChanges`, `signings`, `prospectiveManagers`, `news`. Drives `/season-4` and the S4 editorial articles. Not read by any generation script — a human edits it as S4 information lands. **Hedge line-up claims:** Wikipedia is fan-edited, and `ballerleague.uk` still serves Season 3 until S4 starts.

---

## Routes

30 files in `src/pages/` (32 routes counting dynamic patterns).

**Static**
| Route | Purpose |
|---|---|
| `/` | Homepage — mini table, recent results, upcoming, news |
| `/table` | League table + fixtures + results, client-side GW nav |
| `/gamechangers` | GC analysis — frequency, sequences, ratios, all client-side |
| `/h2h` | Head-to-head comparison tool (team A/B pickers) |
| `/rules` | Rules & format guide (largest static page, 25 KB) |
| `/faq` | FAQ + FAQPage schema |
| `/guide` | Viewing / participation guide |
| `/records` | All-time records |
| `/final-four` | **Playoff bracket page (40 KB — the largest file in the repo)** |
| `/fixtures` | Season schedule — matchday dates, upcoming fixtures, kick-off times |
| `/watch` | Where to watch |
| `/about` | About the hub — mission, sourcing, independence disclaimer, Organization schema |
| `/season-4` | **Season 4 hub** — dates, venue, format, matchdays, signings, manager watch, tickets, S4 news |
| `/sitemap` | Human-facing HTML sitemap page |
| `/404` | Not found |

**Dynamic**
| Route | Notes |
|---|---|
| `/teams/`, `/teams/[slug]` | Index + detail (26 KB — hero, form bar, stats, squad) |
| `/players/`, `/players/[slug]` | Index (search/filter/sort) + detail (162 pages) |
| `/managers/`, `/managers/[slug]` | Manager profiles |
| `/news/`, `/news/[slug]` | Article listing (category filter) + article |
| `/match/[slug]` | Match scorecard, GC analysis, prev/next nav |
| `/roundup/[gw]`, `/roundup/index` | Per-gameweek roundup; index is a meta-refresh redirect to latest GW |
| `/season/[seasonId]`, `/season/index` | Season hub with client-side tab switching |

**Endpoint**
| Route | Notes |
|---|---|
| `/rss.xml` | `rss.xml.ts` — Astro endpoint, prerendered from the `news` collection |

---

## Data flow

```
ballerleague.uk
    ↓ scrape.mjs (IDs 1–350, cached)          ↓ scrape-ep.mjs        ↓ scrape-players.mjs (+AJAX)
gamechangers.json ──┬──→ table.astro, index.astro, teams/[slug].astro,
                    │      h2h.astro, gamechangers.astro, records.astro,
                    │      final-four.astro, season/[seasonId].astro
                    ├──→ roundup/[gw].astro
                    ├──→ match/[slug].astro
                    └──→ players/index.astro (leaderboards)

players.json ───────┬──→ players/[slug].astro, players/index.astro
                    └──→ teams/[slug].astro (squad), managers/[slug].astro

table.json (ep + metadata) ──→ table.astro, teams/[slug].astro, generate-reports.mjs
fixtures.json (upcoming) ─────→ index.astro, table.astro, watch.astro, guide.astro,
                                 teams/[slug].astro, generate-previews.mjs

gamechangers.json + players.json + table.json + fixtures.json
                    └──→ generate-reports.mjs ──→ content/news/*.md ──→ news/[slug].astro
                                 generate-previews.mjs ──→ content/news/*.md
                                 generate-og-images.mjs ──→ public/og/*.png

hand-written content: teams/, players/, managers/ ──→ their [slug] pages
```

---

## Key technical details

### Standings computation
Recomputed per-page from `gamechangers.json`. `pts = won*3 + drawn + ep`. Sort is `pts` → `gd` → `gf`. `generate-reports.mjs` additionally computes "before gameweek N" standings per report.

### Two different match slug schemes — don't confuse them
- **Match pages** (`match/[slug].astro`): `s{season}-{homeSlug}-vs-{awaySlug}-gw{gw}`
  → `/match/s3-ndl-fc-vs-gold-devils-fc-gw10/`
- **News articles** (`generate-reports.mjs`): `{homeSlug}-vs-{awaySlug}-gw{gw}` — **no season prefix**
  → `/news/ndl-fc-vs-gold-devils-fc-gw10/`

The missing season prefix causes real collisions across seasons and is a known bug (see below).

### `scrape-assets.mjs` is orphaned
It duplicates the `TEAM_LOGO_MAP` that also lives in `scrape-players.mjs` — two sources of truth for the same mapping. Nothing invokes it.

### Content collections
Defined in `src/content/config.ts`: `teams`, `players`, `managers`, `news`.
- `players` and `managers` support optional **background** fields: `bio` (one-liner), `formerClubs[]`, `honours[]`, `nationality`. Populated only for notable ex-pros/managers; the rest fall back to the generated blurb.
- `managers` also has `active` (`false` = former manager, hidden from `/managers` but page kept).

### Profile pages (shared design system)
`teams/[slug]`, `players/[slug]` and `managers/[slug]` share the `.profile` visual system defined in `global.css` (not scoped): team-colour hero (`--team-color` / `--team-soft` from `teamColor()` in `src/lib/league.ts`), a large rounded photo, headline stats and a two-column `profile-main` / `profile-side` layout. Player/manager pages render a **Player Profile / About** card and an optional **Background** card (Previous Clubs chips + Honours list). To add a player's history, create `src/content/players/{slug}.md` with the background fields and a markdown bio.

### Editing content
- **Hand-written** (edit freely): `src/content/teams/`, `players/`, `managers/`, and the two editorial articles `rico-chambers-transfer.md` and `yanited-ginge-match-report.md`.
- **Generated** (do NOT hand-edit — overwritten or orphaned on next run): everything in `src/content/news/` matching `*-gw{n}.md` (match reports), `*-gw{n}-preview.md` (fixture previews), `season-{n}-team-preview-*.md` (team season previews), `player-spotlight-*.md` (auto-built player features) and `baller-league-team-history-*.md` (per-club all-time records).

**Decap CMS** is mounted at `/admin` (static files in `public/admin/`, git-gateway backend). Its collections are `news`, `players`, and `league_table` → which edits `src/data/table.json` directly.

### Redirects — four separate mechanisms
1. `netlify.toml` — `/compare` → `/rules` (301)
2. `netlify.toml` — `/admin` → `/admin/index.html` (200)
3. `scripts/generate-redirects.mjs` → `dist/_redirects` (post-build) — legacy numeric `/match/{n}/` → `/match/s{season}-…` (301, 1-based index in JSON iteration order S1→S2→S3)
4. `src/pages/roundup/index.astro` — meta-refresh redirect to the latest GW

### SEO
- JSON-LD on every page via `Base.astro`: `WebSite`, `Organization`, `SportsOrganization`, `SportsTeam`, `Person`, `SportsEvent` (match pages), `FAQPage`, `VideoObject`
- `news/[slug]` emits `NewsArticle` with an absolute `image` (per-article OG PNG), `articleSection` and publisher logo
- `Breadcrumb.astro` renders `BreadcrumbList` server-side (`set:html`)
- **Internal linking:** `teams/[slug]` lists its club-history/preview/match-report articles ("in the news"); `players/[slug]` links the player-spotlight article — so generated news is discovered from entity pages
- `rss.xml.ts` + human-facing `/sitemap` page
- Per-article OG images in `public/og/`, default `og-default.png`
- `robots.txt` references `sitemap.xml`; Search Console verified via `public/google*.html`
- `generate-sitemap.mjs` crawls `dist/`, excludes `404`, `compare/`, `admin*`, `google*`; `<lastmod>` comes from `dist/lastmod.json` (real content dates)
- `ping-indexnow.mjs` notifies Bing/IndexNow after each build (key at `public/<key>.txt`)

### AdSense
Publisher ID `ca-pub-7873503560434517` in `Base.astro`; `ads.txt` in `public/`.

### Domain
`ballerleagueukhub.com` (in `astro.config.mjs`). Netlify handles SSL.

---

## Available commands

| Command | Purpose |
|---|---|
| `npm run update` | Full pipeline: scrape → generate → build (16 stages) |
| `npm run dev` | Dev server at `http://localhost:4321` |
| `npm run build` | `astro build` + `generate-redirects.mjs` + `generate-sitemap.mjs` |
| `npm run preview` | Preview built site |
| `node scripts/scrape.mjs` | Scrape match results only |
| `node scripts/scrape-standings.mjs` | Scrape official standings + EP only |
| `node scripts/scrape-ep.mjs` | Scrape EP values only *(superseded; requires `scrape.mjs` cache first)* |
| `node scripts/scrape-players.mjs` | Scrape player stats only |
| `node scripts/generate-reports.mjs` | Match reports, **current season** (default) |
| `node scripts/generate-reports.mjs --season=all` | Match reports, all seasons ⚠ drops 3 colliding slugs |
| `node scripts/generate-previews.mjs` | Fixture previews (needs non-empty `upcoming`) |
| `node scripts/generate-og-images.mjs` | Per-article OG images |
| `node scripts/generate-og-people.mjs` | Per-player + per-manager OG images |
| `node scripts/generate-placeholders.mjs` | Placeholder player images (missing only) |
| `node scripts/optimize-images.mjs` | Resize player/manager headshots — **manual, not in pipeline** |
| `node scripts/verify-data.mjs` | Verify `gamechangers.json`/`players.json`/`standings.json` vs official |
| `node scripts/season4-news.mjs` | Season 4 Google News monitor — **manual, read-only** (`--all`, `--days=N`) |
| `node scripts/generate-redirects.mjs` | `dist/_redirects` *(post-build only)* |
| `node scripts/generate-sitemap.mjs` | `dist/sitemap.xml` *(post-build only)* |
| `node scripts/ping-indexnow.mjs` | Notify Bing/IndexNow *(post-build only)* |
| `node scripts/scrape-assets.mjs` | Download team logos — **manual, not in pipeline** |

---

## Known Issues / Tech Debt

Ordered by severity. Each is real and present in the current code.

### High

- ✅ **FIXED — `generate-redirects.mjs` wildcard removed.** `/match/s3-*  /news/:splat  301` has been deleted; the numeric legacy redirects remain.

- **`generate-reports.mjs` slugs have no season prefix.** Three `{home}-vs-{away}-gw{n}` keys exist in more than one season (`wembley-rangers-afc-vs-n5-fc-gw4`, `deportrio-vs-yanited-gw5`, `ndl-fc-vs-sds-fc-gw12`). The `seen` Set dedupes by slug, so `--season=all` silently drops the S3 version of `ndl-fc-vs-sds-fc-gw12`: 102 matches pass the GC filter, 101 files are written. The other two collisions are currently masked because their Season 1 entries are filtered out by `gc1 === "unknown"` — they will start dropping the moment S1 scraping improves.
  *Fix: prefix slugs with `s{season}-` and add a redirect map, or key `seen` on `season+slug`.*

- **`sharp` is undeclared in `package.json`.** `generate-og.mjs` and `generate-og-images.mjs` both `import sharp from "sharp"`. It resolves only because Astro lists it as an `optionalDependency`. Any `npm ci --omit=optional`, or an Astro release dropping it, breaks stages 6 and 7.
  *Fix: `npm install --save sharp`.*

### Medium

- ✅ **FIXED — `generate-sitemap.mjs` no longer excludes `match/s3-*`.** All 207 match pages are now in `sitemap.xml`.

- **`generate-previews.mjs` — `getRecord()` compares a name against a slug.** Called as `getRecord(hH2H, home)` where `home` is a display name, but the function compares `m.homeSlug === team`. Never true, so the away-side goal difference is used for every row and the home W/L tally in previews is **always inverted**. Adjacent: `hH2H[0]` is treated as "last meeting" without sorting.

- **`scrape.mjs:378` silently rewrites data.** `if (match.gc1 === "theline") { match.gc1 = "onside"; match._fixed = true; }` — applied only to `gc1`, never `gc2`. Falsifies scraped data to paper over an unknown parsing case.

- ✅ **FIXED — match dates now come from the header's ISO `<time>` attribute**, and season is derived from the date (spring/autumn), so S4 auto-detects.

- **Generators never delete stale markdown.** `generate-reports.mjs` / `generate-previews.mjs` only write. The stale GW9/GW11 report orphans were cleaned this pass; the 14 historical `*-preview.md` files remain until S4 fixtures populate `upcoming`.

- ✅ **FIXED — `generate-sitemap.mjs` `<lastmod>` is now the real content date.** The build emits `dist/lastmod.json` (from `src/pages/lastmod.json.ts` — news `date` + match `matchDate`); the sitemap reads it and omits `<lastmod>` where no date is known, instead of stamping every URL with the build time.

### Low

- **`fixtures.json` `results[]` is read by nothing** — no script, no page.
- **`stage` vs `round` mismatch.** `fixtures.json` writes `stage`; `table.astro:9` reads `fixturesData.upcoming[0]?.round`. Nothing ever writes `round`, so that check is permanently false.
- **`scrape-ep.mjs`** is superseded by `scrape-standings.mjs` and no longer runs in the pipeline.
- ✅ **FIXED — `scrape.mjs` scan ceiling/log** now reads `1-450` from a single `SCAN_MAX`.
- ✅ **FIXED — `generate-og-images.mjs`** now renders the real score and canonical team names.
- **`players.json`** — one `detailed` key retains an un-decoded `&amp;` HTML entity; `age` is `null` for all players.
- **`TEAM_LOGO_MAP` is duplicated** in `scrape-players.mjs` and `scrape-assets.mjs`, and has no entry for team id `333`.
- **`u` variable shadowing** in `generate-sitemap.mjs` — `walk()` and `getPriority()` use different `u` bindings for the URL.
- **`upcomingGW` always falls back to `maxGW`** across several pages because `fixtures.upcoming[0]` is `undefined` when the array is empty.

### Dead code

- `@astrojs/sitemap` is in `dependencies` but `astro.config.mjs` has no `integrations` array — the sitemap is hand-rolled instead.
- `generate-og.mjs` imports `writeFileSync` and never uses it.
- `generate-redirects.mjs` imports `rmSync`/`existsSync`-era leftovers via `update.mjs`'s commented-out cache-clearing block.

### Architectural debt (not bugs)

- **The `src/lib/` migration is only partly done.** `standingsFor`/`formFor`/`matchSlug`/`teamColor` live in `src/lib/league.ts` and are used by the current-season pages, but `gamechangers`, `records`, `h2h`, `final-four` and `roundup` still hardcode Season 3 and duplicate logic inline. Finish migrating them before changing slug/standings rules.
- **`compare/` sitemap exclusion is stale** — `compare.astro` no longer exists (it is a Netlify 301 now).