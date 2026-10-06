import { q } from '../lib/db.js';
import { teamMaps } from './teams.js';
import type { KeyStat, PlayerCardData, PlayerStatus, RatingSummary } from '../../src/types/api.js';

/**
 * Batched player-card builder. A fixed number of queries (≈8) regardless of how many players are
 * requested — used by lineups, matchup, team injuries, and home feeds (no N+1).
 */
export interface CardRequest { playerId: number; teamId: number | null; position?: string | null; depth?: number | null }
export interface CardContext { season: number; week: number; gameDbId?: number | null; completed?: boolean }

export interface RatingRow {
  player_id: number; season: number; rating_position: string; overall_score: number | null; tier: string;
  confidence: string; position_score: number | null; position_rank: number | null; position_count: number | null;
  efficiency_score: number | null; advanced_score: number | null; production_score: number | null;
  consistency_score: number | null; recent_form_score: number | null; games_sample: number | null;
}

export function toRating(r: RatingRow, fromPriorSeason = false): RatingSummary {
  return {
    season: r.season, position: r.rating_position, overall: r.overall_score, tier: r.tier as RatingSummary['tier'],
    confidence: r.confidence as RatingSummary['confidence'], positionScore: r.position_score, positionRank: r.position_rank,
    positionCount: r.position_count, efficiency: r.efficiency_score, advanced: r.advanced_score,
    production: r.production_score, consistency: r.consistency_score, recentForm: r.recent_form_score,
    gamesSample: r.games_sample, fromPriorSeason,
  };
}

const fmt = (v: unknown, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

export function keyStats(pos: string | null, s: Record<string, any> | null): KeyStat[] {
  if (!s) return [];
  const adv = (s.advanced ?? {}) as Record<string, number>;
  switch (pos) {
    case 'QB':
      return [
        { label: 'CMP/ATT', value: `${fmt(s.passing_completions)}/${fmt(s.passing_attempts)}` },
        { label: 'PASS YDS', value: fmt(s.passing_yards) },
        { label: 'TD-INT', value: `${fmt(s.passing_tds)}-${fmt(s.interceptions)}` },
        { label: 'EPA/DB', value: fmt(s.pass_epa_per_play, 3) },
        { label: 'CPOE', value: fmt(s.passing_cpoe, 1) },
      ];
    case 'RB':
      return [
        { label: 'CAR', value: fmt(s.rushing_attempts) }, { label: 'RUSH YDS', value: fmt(s.rushing_yards) },
        { label: 'YPC', value: fmt(s.yards_per_carry, 1) }, { label: 'TD', value: fmt((s.rushing_tds ?? 0) + (s.receiving_tds ?? 0)) },
        { label: 'REC', value: fmt(s.receptions) },
      ];
    case 'WR': case 'TE':
      return [
        { label: 'REC', value: fmt(s.receptions) }, { label: 'TGT', value: fmt(s.targets) },
        { label: 'YDS', value: fmt(s.receiving_yards) }, { label: 'TD', value: fmt(s.receiving_tds) },
        { label: 'Y/TGT', value: s.targets ? fmt(s.receiving_yards / s.targets, 1) : '—' },
      ];
    case 'OL':
      return [
        { label: 'OFF SNAPS', value: fmt(s.offense_snaps) }, { label: 'GAMES', value: fmt(s.games) },
        { label: 'PENALTIES', value: fmt(adv.penalties_pbp ?? s.penalties) },
      ];
    case 'K':
      return [
        { label: 'FG', value: `${fmt(s.fg_made)}/${fmt(s.fg_att)}` },
        { label: 'FG%', value: s.fg_att ? fmt((100 * s.fg_made) / s.fg_att, 1) : '—' },
        { label: 'XP', value: `${fmt(s.pat_made)}/${fmt(s.pat_att)}` },
      ];
    case 'P':
      return [
        { label: 'PUNTS', value: fmt(s.punts) }, { label: 'AVG', value: s.punts ? fmt(s.punt_yards / s.punts, 1) : '—' },
        { label: 'NET', value: s.punts ? fmt(s.punt_net_yards / s.punts, 1) : '—' },
      ];
    default:
      return [
        { label: 'TKL', value: fmt(s.tackles) }, { label: 'SACK', value: fmt(s.sacks_defense, 1) },
        { label: 'TFL', value: fmt(s.tackles_for_loss) }, { label: 'PD', value: fmt(s.passes_defended) },
        { label: 'INT', value: fmt(s.interceptions_defense) },
        ...(adv.pressures != null ? [{ label: 'PRESS', value: fmt(adv.pressures) }] : []),
      ];
  }
}

export function draftText(year: number | null, round: number | null, pick: number | null, team: string | null): string | null {
  if (!year) return null;
  if (!round) return `${year} · Undrafted`;
  return `${year} · R${round}${pick ? ` · #${pick}` : ''}${team ? ` · ${team}` : ''}`;
}

export function statusFrom(inj: any | undefined, rosterStatus: string | undefined, reportExists: boolean, week: number): PlayerStatus {
  const base = { gameStatus: inj?.game_status ?? null, practice: inj?.practice_status ?? null, injury: inj?.injury_description ?? inj?.injury_type ?? null, week };
  const gs = String(inj?.game_status ?? '').toLowerCase();
  if (gs.startsWith('out')) return { code: 'OUT', label: 'OUT', ...base };
  if (gs.startsWith('doubt')) return { code: 'DOUBTFUL', label: 'DOUBTFUL', ...base };
  if (gs.startsWith('question')) return { code: 'QUESTIONABLE', label: 'QUESTIONABLE', ...base };
  if (rosterStatus === 'INA') return { code: 'INACTIVE', label: 'INACTIVE', ...base };
  if (rosterStatus === 'RES') return { code: 'RESERVE', label: 'RESERVE LIST', ...base };
  if (inj) return { code: 'HEALTHY', label: 'NO GAME DESIGNATION', ...base };
  if (reportExists) return { code: 'HEALTHY', label: 'HEALTHY', ...base };
  return { code: 'UNAVAILABLE', label: 'STATUS UNAVAILABLE', ...base };
}

export async function buildCards(reqs: CardRequest[], ctx: CardContext): Promise<Map<number, PlayerCardData>> {
  const out = new Map<number, PlayerCardData>();
  const ids = [...new Set(reqs.map((r) => r.playerId))];
  if (!ids.length) return out;
  const teamIds = [...new Set(reqs.map((r) => r.teamId).filter((x): x is number => x != null))];
  const { byId } = await teamMaps();
  const S = ctx.season, W = ctx.week;
  const [players, ratings, stats, injuries, rosters, reports, recent, bios, snaps] = await Promise.all([
    q<any>(`SELECT p.id, p.gsis_id, p.display_name, p.first_name, p.last_name, p.position, p.jersey_number, p.headshot_url,
                   p.college, p.experience, p.rookie_season, p.draft_year, p.draft_round, p.draft_pick, dt.abbreviation AS draft_team
            FROM players p LEFT JOIN teams dt ON dt.id = p.draft_team_id WHERE p.id = ANY($1)`, [ids]),
    q<RatingRow>(`SELECT * FROM player_ratings WHERE player_id = ANY($1) AND season IN ($2, $2 - 1)`, [ids, S]),
    q<any>(`SELECT * FROM player_season_stats WHERE player_id = ANY($1) AND season IN ($2, $2 - 1) AND season_type = 'REG'`, [ids, S]),
    q<any>(`SELECT * FROM injuries WHERE player_id = ANY($1) AND season = $2 AND week = $3`, [ids, S, W]),
    q<any>(`SELECT player_id, roster_status FROM rosters WHERE player_id = ANY($1) AND season = $2 AND week = $3`, [ids, S, W]),
    q<{ team_id: number }>(`SELECT DISTINCT team_id FROM injuries WHERE team_id = ANY($1) AND season = $2 AND week = $3`, [teamIds, S, W]),
    q<any>(`SELECT player_id, week, season, game_score, o.abbreviation AS opp FROM (
              SELECT w.*, ROW_NUMBER() OVER (PARTITION BY w.player_id ORDER BY w.season DESC, w.week DESC) rn
              FROM player_weekly_stats w
              WHERE w.player_id = ANY($1) AND w.game_score IS NOT NULL AND w.season BETWEEN $2 - 1 AND $2
                AND (w.season < $2 OR w.week < $3)) x
            LEFT JOIN teams o ON o.id = x.opponent_team_id WHERE rn <= 5 ORDER BY season, week`, [ids, S, W]),
    q<any>(`SELECT player_id, bio FROM player_bios WHERE player_id = ANY($1)`, [ids]),
    ctx.gameDbId && ctx.completed
      ? q<any>(`SELECT player_id, offense_pct, defense_pct FROM player_weekly_stats WHERE game_id = $1 AND player_id = ANY($2)`, [ctx.gameDbId, ids])
      : Promise.resolve([] as any[]),
  ]);
  const ratingBy = new Map<string, RatingRow>(ratings.map((r) => [`${r.player_id}:${r.season}`, r]));
  const statBy = new Map<string, any>(stats.map((r) => [`${r.player_id}:${r.season}`, r]));
  const injBy = new Map<number, any>(injuries.map((r) => [r.player_id, r]));
  const rosBy = new Map<number, string>(rosters.map((r) => [r.player_id, r.roster_status]));
  const reportTeams = new Set(reports.map((r) => r.team_id));
  const recentBy = new Map<number, any[]>();
  for (const r of recent) (recentBy.get(r.player_id) ?? recentBy.set(r.player_id, []).get(r.player_id)!).push(r);
  const bioBy = new Map<number, string>(bios.map((b) => [b.player_id, b.bio]));
  const snapBy = new Map<number, any>(snaps.map((s) => [s.player_id, s]));
  const reqBy = new Map<number, CardRequest>(reqs.map((r) => [r.playerId, r]));

  for (const p of players) {
    const req = reqBy.get(p.id)!;
    const cur = ratingBy.get(`${p.id}:${S}`);
    const prev = ratingBy.get(`${p.id}:${S - 1}`);
    let rating: RatingSummary | null = null;
    if (cur && cur.overall_score != null) rating = toRating(cur);
    else if (prev && prev.overall_score != null) rating = toRating(prev, true);
    else if (cur) rating = toRating(cur);
    else if (prev) rating = toRating(prev, true);
    const st = statBy.get(`${p.id}:${S}`) ?? statBy.get(`${p.id}:${S - 1}`) ?? null;
    const rpos = rating?.position ?? null;
    const snap = snapBy.get(p.id);
    const isDef = ['EDGE', 'DL', 'LB', 'CB', 'S'].includes(rpos ?? '');
    const team = req.teamId != null ? byId.get(req.teamId) : undefined;
    out.set(p.id, {
      id: p.gsis_id, name: p.display_name, firstName: p.first_name, lastName: p.last_name,
      position: req.position ?? p.position, ratingPosition: rpos, jersey: p.jersey_number, headshot: p.headshot_url,
      team: team?.abbr ?? null, depth: req.depth ?? null,
      starterLabel: req.depth === 1 ? 'PROJECTED STARTER' : req.depth ? 'DEPTH' : null,
      rating,
      status: statusFrom(injBy.get(p.id), rosBy.get(p.id), req.teamId != null && reportTeams.has(req.teamId), W),
      season: st ? { season: st.season, games: st.games, starts: st.starts, snaps: st.snaps, key: keyStats(rpos ?? p.position, st) } : null,
      recent: (recentBy.get(p.id) ?? []).map((r) => ({ week: r.week, score: r.game_score, opp: r.opp })),
      college: p.college, experience: p.experience,
      draft: draftText(p.draft_year, p.draft_round, p.draft_pick, p.draft_team),
      bio: bioBy.get(p.id) ?? null,
      gameSnapPct: snap ? (isDef ? snap.defense_pct : snap.offense_pct) ?? null : null,
    });
  }
  return out;
}
