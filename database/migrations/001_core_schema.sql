-- GRIDIRON core schema
-- All tables are populated exclusively by the nflverse ingestion layer (server/ingestion).
-- Natural keys (gsis_id, external_id, abbreviation) carry unique constraints so every sync is an UPSERT.

CREATE TABLE IF NOT EXISTS teams (
  id               SERIAL PRIMARY KEY,
  abbreviation     TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  nickname         TEXT,
  city             TEXT,
  conference       TEXT,
  division         TEXT,
  logo_url         TEXT,
  wordmark_url     TEXT,
  primary_color    TEXT,
  secondary_color  TEXT,
  tertiary_color   TEXT,
  stadium          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id               SERIAL PRIMARY KEY,
  gsis_id          TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  position         TEXT,
  position_group   TEXT,
  jersey_number    INTEGER,
  height           INTEGER,            -- inches
  weight           INTEGER,            -- pounds
  birth_date       DATE,
  age              INTEGER,            -- age at last sync; API recomputes from birth_date
  college          TEXT,
  experience       INTEGER,
  status           TEXT,
  rookie_season    INTEGER,
  last_season      INTEGER,
  latest_team_id   INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  draft_year       INTEGER,
  draft_round      INTEGER,
  draft_pick       INTEGER,
  draft_team_id    INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  headshot_url     TEXT,
  pff_id           TEXT,
  pfr_id           TEXT,
  espn_id          TEXT,
  search_text      TEXT,               -- lower-cased name tokens for fast prefix search
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id               SERIAL PRIMARY KEY,
  external_id      TEXT NOT NULL UNIQUE,   -- nflverse game_id, e.g. 2026_05_TB_DAL
  season           INTEGER NOT NULL,
  week             INTEGER NOT NULL,
  season_type      TEXT NOT NULL,          -- REG / POST (game_type kept separately)
  game_type        TEXT,                   -- REG, WC, DIV, CON, SB
  game_date        DATE NOT NULL,
  kickoff          TIMESTAMPTZ,            -- derived from gameday + gametime (US/Eastern)
  weekday          TEXT,
  away_team_id     INTEGER NOT NULL REFERENCES teams(id),
  home_team_id     INTEGER NOT NULL REFERENCES teams(id),
  away_score       INTEGER,
  home_score       INTEGER,
  overtime         BOOLEAN,
  stadium          TEXT,
  roof             TEXT,
  surface          TEXT,
  location         TEXT,                   -- Home / Neutral
  away_coach       TEXT,
  home_coach       TEXT,
  status           TEXT NOT NULL,          -- scheduled / final / awaiting_result
  espn_id          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (away_team_id <> home_team_id)
);

CREATE TABLE IF NOT EXISTS rosters (
  id                    SERIAL PRIMARY KEY,
  season                INTEGER NOT NULL,
  week                  INTEGER NOT NULL,
  game_type             TEXT,
  team_id               INTEGER NOT NULL REFERENCES teams(id),
  player_id             INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position              TEXT,
  depth_chart_position  TEXT,
  jersey_number         INTEGER,
  roster_status         TEXT,              -- ACT, RES, INA, DEV, CUT ...
  status_description    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rosters_unique UNIQUE (season, week, team_id, player_id)
);

CREATE TABLE IF NOT EXISTS depth_charts (
  id               SERIAL PRIMARY KEY,
  season           INTEGER NOT NULL,
  week             INTEGER NOT NULL,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position         TEXT NOT NULL,          -- slot label (QB, LT, LDE, NB, WR ...)
  position_group   TEXT NOT NULL,          -- OFF / DEF / ST
  formation        TEXT,                   -- source formation label (e.g. "Base 3-4 D")
  slot             INTEGER,                -- slot index for multi-slot positions (WR1/WR2/WR3)
  depth            INTEGER NOT NULL,       -- 1 = top of depth chart at that slot
  starter          BOOLEAN NOT NULL DEFAULT false,
  source           TEXT NOT NULL,          -- nflverse_weekly (2001-2024) / nflverse_daily (2025+)
  snapshot_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT depth_charts_unique UNIQUE (season, week, team_id, player_id, position)
);

CREATE TABLE IF NOT EXISTS injuries (
  id                  SERIAL PRIMARY KEY,
  season              INTEGER NOT NULL,
  week                INTEGER NOT NULL,
  game_type           TEXT,
  team_id             INTEGER NOT NULL REFERENCES teams(id),
  player_id           INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  practice_status     TEXT,
  game_status         TEXT,                -- Out / Doubtful / Questionable / NULL (as reported)
  injury_type         TEXT,
  injury_description  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT injuries_unique UNIQUE (season, week, team_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_season_stats (
  id                      SERIAL PRIMARY KEY,
  season                  INTEGER NOT NULL,
  season_type             TEXT NOT NULL DEFAULT 'REG',
  player_id               INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id                 INTEGER REFERENCES teams(id),
  games                   INTEGER,
  starts                  INTEGER,
  snaps                   INTEGER,
  offense_snaps           INTEGER,
  defense_snaps           INTEGER,
  st_snaps                INTEGER,
  passing_attempts        INTEGER,
  passing_completions     INTEGER,
  passing_yards           INTEGER,
  passing_tds             INTEGER,
  interceptions           INTEGER,
  sacks                   INTEGER,
  completion_percentage   NUMERIC(6,2),
  pass_epa                NUMERIC(9,3),
  pass_epa_per_play       NUMERIC(7,4),
  passing_cpoe            NUMERIC(7,3),
  rushing_attempts        INTEGER,
  rushing_yards           INTEGER,
  rushing_tds             INTEGER,
  yards_per_carry         NUMERIC(6,2),
  rush_epa                NUMERIC(9,3),
  targets                 INTEGER,
  receptions              INTEGER,
  receiving_yards         INTEGER,
  receiving_tds           INTEGER,
  yards_per_reception     NUMERIC(6,2),
  receiving_epa           NUMERIC(9,3),
  receiving_yac           INTEGER,
  touches                 INTEGER,
  fumbles_lost            INTEGER,
  tackles                 INTEGER,
  solo_tackles            INTEGER,
  assisted_tackles        INTEGER,
  tackles_for_loss        NUMERIC(6,1),
  qb_hits                 INTEGER,
  sacks_defense           NUMERIC(6,1),
  interceptions_defense   INTEGER,
  passes_defended         INTEGER,
  forced_fumbles          INTEGER,
  fg_made                 INTEGER,
  fg_att                  INTEGER,
  fg_long                 INTEGER,
  pat_made                INTEGER,
  pat_att                 INTEGER,
  punts                   INTEGER,
  punt_yards              INTEGER,
  punt_net_yards          INTEGER,
  punts_inside_20         INTEGER,
  penalties               INTEGER,
  fantasy_points_ppr      NUMERIC(8,2),
  advanced                JSONB NOT NULL DEFAULT '{}'::jsonb,   -- pbp / PFR derived metrics (NULL when unavailable)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_season_stats_unique UNIQUE (season, season_type, player_id)
);

CREATE TABLE IF NOT EXISTS player_weekly_stats (
  id                      SERIAL PRIMARY KEY,
  season                  INTEGER NOT NULL,
  week                    INTEGER NOT NULL,
  season_type             TEXT NOT NULL,
  game_id                 INTEGER REFERENCES games(id) ON DELETE SET NULL,
  game_external_id        TEXT,
  player_id               INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id                 INTEGER REFERENCES teams(id),
  opponent_team_id        INTEGER REFERENCES teams(id),
  position                TEXT,
  passing_attempts        INTEGER,
  passing_completions     INTEGER,
  passing_yards           INTEGER,
  passing_tds             INTEGER,
  interceptions           INTEGER,
  sacks                   INTEGER,
  passing_epa             NUMERIC(9,3),
  passing_cpoe            NUMERIC(7,3),
  rushing_attempts        INTEGER,
  rushing_yards           INTEGER,
  rushing_tds             INTEGER,
  rushing_epa             NUMERIC(9,3),
  targets                 INTEGER,
  receptions              INTEGER,
  receiving_yards         INTEGER,
  receiving_tds           INTEGER,
  receiving_epa           NUMERIC(9,3),
  receiving_yac           INTEGER,
  fumbles_lost            INTEGER,
  solo_tackles            INTEGER,
  assisted_tackles        INTEGER,
  tackles_for_loss        NUMERIC(6,1),
  sacks_defense           NUMERIC(6,1),
  qb_hits                 INTEGER,
  interceptions_defense   INTEGER,
  passes_defended         INTEGER,
  forced_fumbles          INTEGER,
  fg_made                 INTEGER,
  fg_att                  INTEGER,
  pat_made                INTEGER,
  pat_att                 INTEGER,
  punts                   INTEGER,
  punt_yards              INTEGER,
  punt_net_yards          INTEGER,
  penalties               INTEGER,
  offense_snaps           INTEGER,
  offense_pct             NUMERIC(5,3),
  defense_snaps           INTEGER,
  defense_pct             NUMERIC(5,3),
  st_snaps                INTEGER,
  pressures               INTEGER,
  targets_allowed         INTEGER,
  completions_allowed     INTEGER,
  yards_allowed           INTEGER,
  missed_tackles          INTEGER,
  fantasy_points_ppr      NUMERIC(8,2),
  game_score              NUMERIC(5,1),        -- GRIDIRON weekly game grade (analytics layer)
  stats                   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- full raw nflverse row (column-change tolerant)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_weekly_stats_unique UNIQUE (season, week, season_type, player_id)
);

CREATE TABLE IF NOT EXISTS next_gen_stats (
  id               SERIAL PRIMARY KEY,
  season           INTEGER NOT NULL,
  week             INTEGER NOT NULL,        -- 0 = season aggregate (nflverse convention)
  season_type      TEXT NOT NULL,
  player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_type        TEXT NOT NULL,           -- passing / rushing / receiving
  metric_name      TEXT NOT NULL,
  metric_value     DOUBLE PRECISION,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT next_gen_stats_unique UNIQUE (season, week, season_type, player_id, stat_type, metric_name)
);

CREATE TABLE IF NOT EXISTS player_ratings (
  id                  SERIAL PRIMARY KEY,
  player_id           INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season              INTEGER NOT NULL,
  rating_position     TEXT NOT NULL,        -- QB RB WR TE OL DL EDGE LB CB S K P
  team_id             INTEGER REFERENCES teams(id),
  overall_score       NUMERIC(4,1),         -- NULL => INSUFFICIENT DATA
  position_score      NUMERIC(4,1),         -- composite percentile among same position & season
  production_score    NUMERIC(4,1),
  efficiency_score    NUMERIC(4,1),
  advanced_score      NUMERIC(4,1),
  consistency_score   NUMERIC(4,1),
  recent_form_score   NUMERIC(4,1),
  composite_raw       NUMERIC(5,2),         -- weighted percentile blend before tier calibration
  confidence_score    NUMERIC(4,1),
  confidence          TEXT NOT NULL,        -- HIGH / MEDIUM / LOW
  tier                TEXT NOT NULL,
  position_rank       INTEGER,
  position_count      INTEGER,
  games_sample        INTEGER,
  metrics_available   INTEGER,
  metrics_defined     INTEGER,
  rating_version      TEXT NOT NULL,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_ratings_unique UNIQUE (player_id, season)
);

CREATE TABLE IF NOT EXISTS player_rating_components (
  id               SERIAL PRIMARY KEY,
  player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season           INTEGER NOT NULL,
  component        TEXT NOT NULL,           -- efficiency / advanced / production / consistency / recent_form
  metric           TEXT NOT NULL,
  label            TEXT,
  raw_value        DOUBLE PRECISION,
  percentile       NUMERIC(5,1),
  weight           NUMERIC(6,4),            -- effective weight within the overall score after redistribution
  weighted_value   NUMERIC(7,3),
  higher_is_better BOOLEAN DEFAULT true,
  scope            TEXT DEFAULT 'player',   -- player / team (team-level indicators, e.g. OL)
  rating_version   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_rating_components_unique UNIQUE (player_id, season, component, metric)
);

CREATE TABLE IF NOT EXISTS player_bios (
  id               SERIAL PRIMARY KEY,
  player_id        INTEGER NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  bio              TEXT,
  career_summary   TEXT,
  college_summary  TEXT,
  draft_summary    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operational tables -------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_state (
  dataset          TEXT NOT NULL,
  part             TEXT NOT NULL,            -- e.g. season "2024" or "all"
  source_url       TEXT,
  etag             TEXT,
  last_modified    TEXT,
  content_length   BIGINT,
  rows_upserted    INTEGER,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, part)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id               SERIAL PRIMARY KEY,
  job              TEXT NOT NULL,
  status           TEXT NOT NULL,            -- running / success / error
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  rows_affected    INTEGER,
  message          TEXT,
  log              TEXT
);
