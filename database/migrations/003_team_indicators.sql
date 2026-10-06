-- Team-level offensive indicators derived from play-by-play (sack rate, rush EPA ...).
-- Used only as clearly-labelled TEAM-scope inputs for offensive-line ratings.
CREATE TABLE IF NOT EXISTS team_season_indicators (
  season      INTEGER NOT NULL,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  indicators  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, team_id)
);
