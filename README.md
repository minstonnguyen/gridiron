# GRIDIRON

**Know who you're watching.** GRIDIRON is an NFL matchup-intelligence app: pick a game, see both teams' projected starting lineups on an interactive field, hover any player for a scouting card, and open full player profiles with an independent analytics rating, season stats, game logs and advanced metrics.

`SCHEDULE → GAME → MATCHUP → STARTING LINEUPS → PLAYER CARD → PLAYER PROFILE → PLAYER ANALYTICS`

All football data comes from the open [nflverse](https://github.com/nflverse) project. GRIDIRON is an independent fan project — not affiliated with the NFL, EA Sports, PFF, ESPN or nflverse.

> GRIDIRON Analytics Rating is an independent rating calculated from publicly available statistics. It is not a PFF grade, Madden rating, NFL rating, or official league rating.

## Architecture

```
nflverse releases ──► Python ingestion (server/ingestion) ──► PostgreSQL (database/migrations)
                                                             │
                                server/analytics (ratings, bios) ◄┘
                                                             │
                     TypeScript services (server/services) ──┤
                       ├─ Express API (server/api)  → live mode  (/api/*)
                       └─ Static exporter (scripts/export-static.ts) → dist/data/*.json → GitHub Pages
                                                             │
                     React + TypeScript + Tailwind + Recharts (src/)
```

- **PostgreSQL is the source of truth.** Ingestion is idempotent (`INSERT … ON CONFLICT DO UPDATE`), keyed on natural IDs, and never deletes historical data. Source files are tracked by ETag/Last-Modified in `sync_state`, so re-runs skip unchanged files. Every run is logged in `sync_runs`.
- **Two serving modes, one codebase.** The Express API and the static exporter call the same service functions against the same database. GitHub Pages can only host static files, so the deployed site uses the static export (`VITE_DATA_MODE=static`); run the API locally (or on any Node host) for live mode.
- **No secrets in the browser.** `DATABASE_URL`, `ADMIN_TOKEN` and ingestion credentials live only in the server/Actions environment.
- **No fabricated data.** Missing values are stored as `NULL` and rendered as `DATA UNAVAILABLE` / `INSUFFICIENT DATA`. Depth-chart starters are labelled `PROJECTED STARTER`. Injury statuses appear only when on the official report. nflverse has no live feed, so no live scores/clock are ever shown.

### Data (backfilled from 2016)
players · teams · games · weekly rosters · depth charts · injuries · weekly player stats + snap counts · season stats (box score + play-by-play + PFR advanced) · Next Gen Stats · ratings + rating components · generated bios.

### GRIDIRON Analytics Rating (`server/analytics/ratings.py`)
Per player-season, within the same position group: 40% efficiency · 25% advanced · 20% production · 10% consistency · 5% recent form. Each metric is a percentile; missing inputs are dropped and their weight redistributed, lowering confidence (HIGH / MEDIUM / LOW). Players below sample minimums get `INSUFFICIENT DATA`. Tiers: 95+ Generational · 90–94 Elite · 85–89 Star · 80–84 Above Average · 70–79 Average · 60–69 Below Average · 0–59 Developing. All components are stored in `player_rating_components`.

## Running locally

```bash
# 1. PostgreSQL (any 14+). Supabase works too — use its connection string.
export DATABASE_URL=postgresql://gridiron:gridiron@localhost:5432/gridiron

# 2. Ingest (first run backfills 2016→current season; re-runs are incremental)
pip install -r requirements.txt
python scripts/sync/sync.py all          # or: in-season | players | games | rosters | depth-charts | injuries | stats | ngs | ratings | bios
                                          # flags: --seasons 2016-2026 --force

# 3. App
npm install
ADMIN_TOKEN=change-me npm run api        # Express API on :8787
npm run dev                              # Vite on :5173 (proxies /api)
npm run typecheck
```

Static build (what GitHub Pages serves): `npm run build:static` → `dist/`.

### API
`GET /api/games` `?season&week&team&date` · `/api/games/:id` · `/api/games/:id/lineups` · `/api/games/:id/matchup` · `/api/players` `?season&position&team&q&page&pageSize` · `/api/players/:id` · `/api/players/:id/stats` · `/api/players/:id/rating?season` · `/api/players/:id/game-log` · `/api/teams` · `/api/teams/:id` · `/api/teams/:id/roster` · `/api/teams/:id/depth-chart` · `/api/search?q` · `/api/meta` · `/api/home`

Admin (requires `Authorization: Bearer $ADMIN_TOKEN`): `GET /api/admin/health`, `POST /api/admin/sync/{all,players,games,rosters,depth-charts,injuries,stats,ngs}`, `POST /api/admin/ratings/recalculate`.

## Deployment (GitHub Pages, free)

`.github/workflows/deploy.yml` runs on push, on a schedule (daily, every 6 h in season) and on demand (**Actions → Sync & Deploy → Run workflow**, choose a job):

1. Starts a PostgreSQL service container and restores the last database snapshot (Actions cache, or the `db-snapshot` release on first run). With an empty database it runs a full backfill.
2. Runs the Python sync, recalculates ratings, saves a new snapshot.
3. Builds the React app and exports the database to static JSON, then deploys to Pages.

To use Supabase instead of the ephemeral container, add a `DATABASE_URL` repository secret (include `?sslmode=require`).

## Project structure

```
src/        components · pages · features/{games,players,lineups,ratings} · lib · api · types · hooks
server/     api (Express) · services (TS data access) · ingestion (Python nflverse sync) · analytics (ratings, bios) · lib
database/   migrations (001 core schema, 002 indexes, 003 team indicators)
scripts/    sync/sync.py (ingestion CLI) · export-static.ts (Pages export)
```
