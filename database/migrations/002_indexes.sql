-- Indexes tuned for schedule, matchup, lineup, search and profile queries.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_players_display_name      ON players (display_name);
CREATE INDEX IF NOT EXISTS idx_players_search_trgm       ON players USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_players_position          ON players (position);
CREATE INDEX IF NOT EXISTS idx_players_latest_team       ON players (latest_team_id);
CREATE INDEX IF NOT EXISTS idx_players_gsis_id           ON players (gsis_id);
CREATE INDEX IF NOT EXISTS idx_players_pfr_id            ON players (pfr_id);

CREATE INDEX IF NOT EXISTS idx_games_season              ON games (season);
CREATE INDEX IF NOT EXISTS idx_games_week                ON games (week);
CREATE INDEX IF NOT EXISTS idx_games_season_week         ON games (season, week);
CREATE INDEX IF NOT EXISTS idx_games_game_date           ON games (game_date);
CREATE INDEX IF NOT EXISTS idx_games_home_team           ON games (home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team           ON games (away_team_id);

CREATE INDEX IF NOT EXISTS idx_rosters_player            ON rosters (player_id);
CREATE INDEX IF NOT EXISTS idx_rosters_team              ON rosters (team_id);
CREATE INDEX IF NOT EXISTS idx_rosters_team_season_week  ON rosters (team_id, season, week);

CREATE INDEX IF NOT EXISTS idx_depth_player              ON depth_charts (player_id);
CREATE INDEX IF NOT EXISTS idx_depth_team                ON depth_charts (team_id);
CREATE INDEX IF NOT EXISTS idx_depth_team_season_week    ON depth_charts (team_id, season, week);

CREATE INDEX IF NOT EXISTS idx_injuries_player           ON injuries (player_id);
CREATE INDEX IF NOT EXISTS idx_injuries_team_season_week ON injuries (team_id, season, week);

CREATE INDEX IF NOT EXISTS idx_pss_player                ON player_season_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_pws_player                ON player_weekly_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_pws_player_season         ON player_weekly_stats (player_id, season);
CREATE INDEX IF NOT EXISTS idx_pws_game                  ON player_weekly_stats (game_id);
CREATE INDEX IF NOT EXISTS idx_ngs_player                ON next_gen_stats (player_id, season);

CREATE INDEX IF NOT EXISTS idx_ratings_player            ON player_ratings (player_id);
CREATE INDEX IF NOT EXISTS idx_ratings_season            ON player_ratings (season);
CREATE INDEX IF NOT EXISTS idx_ratings_season_pos        ON player_ratings (season, rating_position, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_rating_comp_player        ON player_rating_components (player_id, season);
