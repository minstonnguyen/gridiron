# GRIDIRON — user flows to re-verify after every change

Run against the static build (`dist/`, served at `/gridiron/` on GitHub Pages or `python3 -m http.server` locally). All routes are hash routes.

## Existing app

1. **Home** `#/` — this week's games load from `data/*.json`; no console errors.
2. **Schedule** `#/schedule` — week selector changes games; final scores show only for completed games; hover on a greyed (final) game row stays readable.
3. **Matchups** `#/matchups` — matchup cards render with team comparisons.
4. **Game** `#/game/:id` and `#/game/:id/gameday` — header, team stats, injury report (real data only) and game-day view render.
5. **Players** `#/players` — search, position filter, and the **draft-class filter** (e.g. 2024 shows only 2024 draftees; "Undrafted" works).
6. **Player profile** `#/player/:id` — bio, ratings, stats, draft line.
7. **Teams** `#/teams`, `#/team/:abbr` — index grid and team page with roster.
8. **Admin data** `#/admin/data` — ingestion status (read-only in static mode, no secrets).
9. **Data sources** `#/data-sources` — attribution list.

## Franchise Mode

1. **Saves list** `#/franchise` — empty state, "New career" modal: pick any of 32 teams, coach name, Ironman toggle, assistant-roster toggle → creates a save and opens the inbox.
2. **Inbox** — ownership welcome first, then assistant GM/roster notes; opening a message marks it read.
3. **Continue** — split button (next day / to next game / one week); stops on game day; result message appears after a game; blocker banner shows when roster is illegal (over 53, over 16 PS, over the cap) and Continue refuses.
4. **Squad** — tabs Active / Practice squad / Reserve / Free agents / Waivers; sorting; FA list shows asking price and last club.
5. **Player actions** — Release modal (dead money + savings; player goes to waivers or FA), Sign FA modal (1-year in season), move to PS / promote / IR / activate.
6. **Player page** `…/player/:id` — scouted attributes (1–20 scale, fog of war), stars, contract, history, evidence basis.
7. **Depth chart** — move up/down, lock, auto-fill.
8. **Schedule** — results with SIM vs REAL labels; Standings — divisions, conferences and playoff seeds.
9. **Finances** — cap space, top cap hits, dead money; **Staff**, **News**, **Transactions** render.
10. **Save tools** — Save, Save a copy (hidden for Ironman), Export (.gridiron gz) and Import on the saves list; Delete.
11. **Realism report** `#/franchise/calibration` — draft hit-rate tables, franchise-QB rates, model checks from `calibration-report.json`, literature links.
12. **Mobile (375px)** — sidebar becomes horizontal chip nav; tables scroll horizontally; no clipped header.
