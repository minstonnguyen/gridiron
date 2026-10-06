import { q, one } from '../lib/db.js';
import { cached, TTL } from '../lib/cache.js';
import { buildCards, toRating, type RatingRow } from './cards.js';
import { getMeta } from './games.js';
import { teamMaps } from './teams.js';
import type {
  GameLogRow, PlayerListItem, PlayerProfile, PlayerRatingResponse, PlayerStatsResponse, PlayersPage, RatingComponent,
} from '../../src/types/api.js';

export const LIST_COLS = `p.gsis_id, p.display_name, p.position, p.headshot_url, p.jersey_number,
  r.rating_position, r.overall_score, r.tier, r.confidence, r.position_rank, t.abbreviation AS team, t.primary_color`;

export function toListItem(r: any): PlayerListItem {
  return {
    id: r.gsis_id, name: r.display_name, position: r.position, ratingPosition: r.rating_position ?? null, team: r.team ?? null,
    teamPrimary: r.primary_color ?? null, headshot: r.headshot_url, jersey: r.jersey_number, overall: r.overall_score ?? null,
    tier: r.tier ?? null, confidence: r.confidence ?? null, positionRank: r.position_rank ?? null,
  };
}

export async function resolvePlayerId(id: string): Promise<number | null> {
  const row = await one<{ id: number }>('SELECT id FROM players WHERE gsis_id = $1', [id]);
  return row?.id ?? null;
}

export interface PlayerFilters { season?: number; position?: string; team?: string; q?: string; page?: number; pageSize?: number; rated?: boolean }

export async function listPlayers(f: PlayerFilters): Promise<PlayersPage> {
  const meta = await getMeta();
  const season = f.season ?? meta.currentSeason;
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where = ['r.season = $1'];
  const params: unknown[] = [season];
  if (f.position) { params.push(f.position.toUpperCase()); where.push(`r.rating_position = $${params.length}`); }
  if (f.team) { params.push(f.team.toUpperCase()); where.push(`t.abbreviation = $${params.length}`); }
  if (f.q) { params.push(`%${f.q.toLowerCase()}%`); where.push(`p.search_text LIKE $${params.length}`); }
  if (f.rated !== false) where.push('r.overall_score IS NOT NULL');
  params.push(pageSize, (page - 1) * pageSize);
  const key = `players:${JSON.stringify({ season, ...f, page, pageSize })}`;
  return cached(key, TTL.ratings, async () => {
    const rows = await q<any>(
      `SELECT ${LIST_COLS}, COUNT(*) OVER() AS total FROM player_ratings r
         JOIN players p ON p.id = r.player_id LEFT JOIN teams t ON t.id = r.team_id
        WHERE ${where.join(' AND ')}
        ORDER BY r.overall_score DESC NULLS LAST, r.composite_raw DESC NULLS LAST, p.display_name
        LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { season, total: rows[0]?.total ?? 0, page, pageSize, items: rows.map(toListItem) };
  });
}

export async function getPlayer(id: string): Promise<PlayerProfile | null> {
  const p = await one<any>(
    `SELECT p.*, dt.abbreviation AS draft_team,
            (SELECT team_id FROM rosters r WHERE r.player_id = p.id ORDER BY season DESC, week DESC LIMIT 1) AS roster_team_id,
            b.bio, b.career_summary, b.college_summary, b.draft_summary
       FROM players p LEFT JOIN teams dt ON dt.id = p.draft_team_id LEFT JOIN player_bios b ON b.player_id = p.id
      WHERE p.gsis_id = $1`, [id]);
  if (!p) return null;
  const [{ byId }, meta, ratings] = await Promise.all([
    teamMaps(), getMeta(),
    q<RatingRow>('SELECT * FROM player_ratings WHERE player_id = $1 ORDER BY season DESC', [p.id]),
  ]);
  const teamId = p.roster_team_id ?? p.latest_team_id;
  const cards = await buildCards([{ playerId: p.id, teamId }], { season: meta.currentSeason, week: meta.currentWeek ?? 1 });
  const card = cards.get(p.id);
  const age = p.birth_date
    ? Math.floor((Date.now() - new Date(p.birth_date + 'T00:00:00Z').getTime()) / (365.2425 * 86400_000))
    : p.age;
  return {
    id: p.gsis_id, name: p.display_name, firstName: p.first_name, lastName: p.last_name, position: p.position,
    positionGroup: p.position_group, jersey: p.jersey_number, height: p.height, weight: p.weight, birthDate: p.birth_date,
    age, college: p.college, experience: p.experience, status: p.status, rookieSeason: p.rookie_season,
    draft: { year: p.draft_year, round: p.draft_round, pick: p.draft_pick, team: p.draft_team },
    headshot: p.headshot_url, team: teamId ? byId.get(teamId) ?? null : null,
    currentStatus: card?.status ?? { code: 'UNAVAILABLE', label: 'STATUS UNAVAILABLE', gameStatus: null, practice: null, injury: null, week: null },
    bio: p.bio || p.career_summary ? { bio: p.bio, career: p.career_summary, college: p.college_summary, draft: p.draft_summary } : null,
    ratings: ratings.map((r) => toRating(r)),
  };
}

export async function getPlayerStats(id: string): Promise<PlayerStatsResponse | null> {
  const pid = await resolvePlayerId(id);
  if (!pid) return null;
  const [rows, ngs] = await Promise.all([
    q<any>(`SELECT s.*, t.abbreviation AS team FROM player_season_stats s LEFT JOIN teams t ON t.id = s.team_id
             WHERE s.player_id = $1 ORDER BY s.season DESC, s.season_type DESC`, [pid]),
    q<any>(`SELECT season, stat_type, metric_name, metric_value FROM next_gen_stats
             WHERE player_id = $1 AND week = 0 AND season_type = 'REG'`, [pid]),
  ]);
  const advanced: PlayerStatsResponse['advanced'] = {};
  const seasons = rows.map((r) => {
    const { advanced: adv, id: _i, player_id: _p, team_id: _t, created_at: _c, updated_at: _u, ...rest } = r;
    if (r.season_type === 'REG') advanced[r.season] = adv ?? {};
    return { ...rest, seasonType: r.season_type, team: r.team };
  });
  const ngsOut: PlayerStatsResponse['ngs'] = {};
  for (const n of ngs) (ngsOut[n.season] ??= {})[`${n.stat_type}.${n.metric_name}`] = n.metric_value;
  return { seasons, advanced, ngs: ngsOut };
}

export async function getPlayerRating(id: string, season?: number): Promise<PlayerRatingResponse | null> {
  const pid = await resolvePlayerId(id);
  if (!pid) return null;
  const history = await q<RatingRow>('SELECT * FROM player_ratings WHERE player_id = $1 ORDER BY season DESC', [pid]);
  const chosen = season != null ? history.find((h) => h.season === season) : history.find((h) => h.overall_score != null) ?? history[0];
  const comps = chosen
    ? await q<any>(`SELECT component, metric, label, raw_value, percentile, weight, weighted_value, higher_is_better, scope
                      FROM player_rating_components WHERE player_id = $1 AND season = $2 ORDER BY component, weight DESC`, [pid, chosen.season])
    : [];
  const components: RatingComponent[] = comps.map((c) => ({
    component: c.component, metric: c.metric, label: c.label, raw: c.raw_value, percentile: c.percentile, weight: c.weight,
    weighted: c.weighted_value, higherIsBetter: c.higher_is_better, scope: c.scope,
  }));
  return {
    rating: chosen ? toRating(chosen) : null,
    components,
    history: history.map((h) => toRating(h)),
    formula: { weights: { efficiency: 0.4, advanced: 0.25, production: 0.2, consistency: 0.1, recent_form: 0.05 }, version: 'gar-1.0' },
  };
}

/** All ratings of a player keyed by season (used by static export to avoid per-season requests). */
export async function getPlayerRatingsAll(id: string): Promise<Record<string, PlayerRatingResponse>> {
  const pid = await resolvePlayerId(id);
  if (!pid) return {};
  const seasons = await q<{ season: number }>('SELECT season FROM player_ratings WHERE player_id = $1', [pid]);
  const out: Record<string, PlayerRatingResponse> = {};
  for (const s of seasons) out[s.season] = (await getPlayerRating(id, s.season))!;
  return out;
}

const LOG_COLS = [
  'passing_completions', 'passing_attempts', 'passing_yards', 'passing_tds', 'interceptions', 'sacks', 'passing_epa',
  'passing_cpoe', 'rushing_attempts', 'rushing_yards', 'rushing_tds', 'rushing_epa', 'targets', 'receptions',
  'receiving_yards', 'receiving_tds', 'receiving_epa', 'receiving_yac', 'fumbles_lost', 'solo_tackles', 'assisted_tackles',
  'tackles_for_loss', 'sacks_defense', 'qb_hits', 'interceptions_defense', 'passes_defended', 'forced_fumbles', 'fg_made',
  'fg_att', 'pat_made', 'pat_att', 'punts', 'punt_yards', 'punt_net_yards', 'offense_snaps', 'offense_pct',
  'defense_snaps', 'defense_pct', 'st_snaps', 'pressures', 'targets_allowed', 'completions_allowed', 'yards_allowed',
  'missed_tackles', 'fantasy_points_ppr',
];

export async function getGameLog(id: string, season?: number): Promise<GameLogRow[] | null> {
  const pid = await resolvePlayerId(id);
  if (!pid) return null;
  const params: unknown[] = [pid];
  let filter = '';
  if (season != null) { params.push(season); filter = 'AND w.season = $2'; }
  const rows = await q<any>(
    `SELECT w.season, w.week, w.season_type, w.game_external_id, w.game_score, t.abbreviation AS team, o.abbreviation AS opp,
            g.home_team_id, g.away_score, g.home_score, g.status, w.team_id, ${LOG_COLS.map((c) => `w.${c}`).join(', ')}
       FROM player_weekly_stats w
       LEFT JOIN teams t ON t.id = w.team_id LEFT JOIN teams o ON o.id = w.opponent_team_id
       LEFT JOIN games g ON g.id = w.game_id
      WHERE w.player_id = $1 ${filter}
      ORDER BY w.season DESC, w.week DESC`, params);
  return rows.map((r) => {
    const home = r.home_team_id != null ? r.home_team_id === r.team_id : null;
    let result: string | null = null;
    if (r.status === 'final' && r.home_score != null && home != null) {
      const us = home ? r.home_score : r.away_score, them = home ? r.away_score : r.home_score;
      result = `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}`;
    }
    const out: GameLogRow = {
      season: r.season, week: r.week, seasonType: r.season_type, gameId: r.game_external_id, team: r.team, opp: r.opp,
      home, result, gameScore: r.game_score,
    };
    for (const c of LOG_COLS) out[c] = r[c];
    return out;
  });
}
