# SEO review — baseline & follow-up

## Baseline (GSC export, 2026-11-03)

28 days to **2026-11-01** (web search):

- **516 clicks**
- **27.1K impressions**
- **1.9% CTR**
- **8.6 average position**

Weekly spikes line up with matchdays; traffic decays between gameweeks.

### Biggest CTR opportunities (same window)

| Page | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|
| `/news/baller-league-season-4-guide/` | 52 | 3,152 | 1.65% | 7.65 |
| `/teams/` | 39 | 2,722 | 1.43% | 9.01 |
| `/rules/` | 6 | 2,587 | 0.23% | 11.08 |
| `/managers/danny-aarons/` | 27 | 1,320 | 2.05% | 4.49 |
| `/fixtures/` | 42 | 1,312 | 3.20% | 7.88 |
| `/news/baller-league-arena-tickets-guide/` | 47 | 1,217 | 3.86% | 8.07 |
| `/` | 7 | 984 | 0.71% | 14.8 |
| `/news/baller-league-season-4-managers-confirmed/` | 9 | 702 | 1.28% | 7.26 |
| `/faq/` | 1 | 654 | 0.15% | 13.48 |
| `/table/` | 4 | 230 | 1.74% | 15.55 |

### Rules diagnosis

- `/rules/` took almost all rule impressions: **2,587 impressions, 6 clicks, 0.23% CTR, position 11.08**.
- The six per-rule explainers had negligible impressions — this was **not** cannibalisation.
- Rule queries sat on page 1/2 with almost no clicks: `baller league rules` (pos 10.21), `baller league uk rules` (9.39), `baller league offside rule` (9.8), `game changer rules` (12.33), `wildcard rules` (15.06).
- Conclusion: ranking + snippet problem on `/rules`, likely accelerated by the 11 Oct rewrite.

### Manager pages (28d)

| Page | Clicks | Impressions | CTR | Position |
|---|---:|---:|---:|---:|
| `/managers/danny-aarons/` | 27 | 1,320 | 2.05% | 4.49 |
| `/managers/jay-jay-okocha/` | 16 | 232 | 6.90% | 3.77 |
| `/managers/alex-iwobi/` | 7 (split) | 471 (split) | ~1.5% | ~4.5–5 |
| `/managers/spencer-owen/` | 5 | 138 | 3.62% | 5.43 |

Queries: `jay jay okocha baller league` (70 impr, 13 clicks, 18.57%, pos 2.17), `danny aarons baller league` (141 impr, 9 clicks, 6.38%, pos 2.93), `danny aarons manager` (95 impr, 0 clicks, pos 4.09).

Follow-up shipped: former-manager links on club pages (Wembley → Shearer/Wright, P17/Rukkas → Idris Elba, RTG/Yanited → Angry Ginge), `Person` schema `url` + `sameAs`, and a managers-hub FAQ/ItemList/schema overhaul. Technical check: all 17 manager pages are `index, follow` and present in `sitemap.xml`; use URL Inspection to request indexing for any that are not yet indexed.

### Duplicate URL variants

GSC split some pages between `/path` and `/path/` (e.g. `/teams/toma` 221 + `/teams/toma/` 524). The no-slash URLs 301 to the slash version, but internal links often omitted the slash.

## Changes shipped (2026-11-03)

- Rewrote titles/descriptions for `/rules`, `/teams`, season guide, manager template, homepage, managers list, FAQ and `/table`.
- Rules page: answer-first quick answer, stronger rule-query FAQ coverage, updated title/schema.
- Teams index and season guide: visible FAQ blocks + `FAQPage`/`ItemList` schema.
- Manager pages: concise non-truncated meta descriptions.
- `scripts/normalize-internal-links.mjs` now rewrites built internal page links to trailing-slash canonicals (runs inside `npm run build`).
- Added related links from table/fixtures/season guide into rules, explainers and reports.
- `/table` no longer advertises "upcoming GW1 fixtures" when no next gameweek is published.

## Phase A shipped (2026-11-03)

- New **`/arena`** page: venue, travel, ticket types, official Fever link, matchday schedule and FAQ (`Place` + `FAQPage` schema). Linked from nav, footer, homepage, fixtures, season-4 and the tickets guide.
- **Team pages**: per-team titles/descriptions with manager + table position, visible FAQ and `FAQPage` schema.
- **Players hub**: new title/description, `ItemList` + `FAQPage` schema, visible FAQ and links to teams/managers/rules.
- **Player pages**: query-focused titles and `url` in the `Person` schema.
- **Table page**: visible FAQ and `FAQPage` schema covering points, EP, leader and Final Four qualification.
- **Keyword research**: `scripts/keyword-research.mjs` writes `docs/keyword-opportunities.csv` (536 UK autocomplete ideas, US terms filtered out). Run manually with `node scripts/keyword-research.mjs`.

## Phase B shipped (2026-11-03)

- **Season archive pages** (`/season/1`, `/season/2`, `/season/3`): query-focused titles/descriptions, champion + runner-up banner, top scorers, Final Four results and `FAQPage` schema.
- **Final Four page**: new title/description for “Final Four 2026”, competitive format, tickets and past-winner queries; visible FAQ + `FAQPage` schema and links to the season archive/arena.
- **Team preview articles**: new titles/excerpts, per-team FAQs (manager, key players, next fixture, last season’s finish), rendered FAQ + `FAQPage` schema; deterministic outlook text so weekly runs no longer churn prose.
- **Tickets guide**: updated title/excerpt and venue/travel/ticket FAQs.

## Follow-up review (target: 2026-11-24, after 2–3 weeks)

1. Export GSC again for the last 28 days.
2. Compare the pages above — especially `/rules`, `/teams`, season guide, `/table`, and the manager template.
3. Check rule-query positions/clicks: `baller league rules`, `baller league offside rule`, `baller league wildcard rules`, `baller league game changer rules`.
4. Check whether slash/no-slash duplicate rows have consolidated — especially the manager pages (`/managers/alex-iwobi` vs `/managers/alex-iwobi/`).
5. Confirm `/explainers/`, `/reports/` and every `/managers/` page is indexed. Request indexing for any that are not.
6. Record the new baseline here and decide the next actions (content depth vs internal links vs CTR iteration).

Note: GSC data lags ~2–3 days; use the 28-day window ending the day before the review.
