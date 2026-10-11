---
description: Run the weekly Baller League UK update — scrape, generate, build, verify, deploy
agent: build
---

Perform the weekly Baller League UK data update. Follow `AGENTS.md` for all conventions.

1. **Update**: Run `npm.cmd run update` (Windows: use `npm.cmd`, never `npm.ps1`). This scrapes upcoming fixtures from `/en/matches`, scrapes results + standings + player stats, regenerates reports/previews/OG images, verifies data, and builds.
2. **Check fixtures**: Confirm the log line `1/12 Scraping upcoming fixtures` reported the expected gameweek/teams. If it reported "No upcoming fixtures found", the current gameweek is complete and the site is already showing the latest results — that's fine.
3. **Verify**: Confirm `node scripts/verify-data.mjs` prints `✅ PASS` (run inside update, or re-run manually). If it fails, diagnose (stale match cache → delete `scripts/.cache/*.html`; player stats → delete `scripts/.cache-players/`; missing matches → check the scan ceiling in `scripts/scrape.mjs`) and fix before continuing.
4. **Review**: Show `git status -sb` and a concise summary of changed data/generated files.
5. **Deploy**: If everything passes, stage all changes, commit with message `GW{n} update`, and push. This triggers the Netlify deploy.

Do not hand-edit generated files under `src/content/news/` matching `*-gw{n}.md` or `*-preview.md`. Season-4 fixtures are auto-scraped — do not hand-edit `src/data/fixtures.json` unless the scraper is broken.
