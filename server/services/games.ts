import { q, one } from '../lib/db.js';
import { cached, TTL } from '../lib/cache.js';
import { CURRENT_SEASON } from '../lib/season.js';
import { teamMaps } from './teams.js';
import type { GameDetail, GameSummary, MetaResponse, TeamRecord } from '../../src/types/api.js';

interface GameRow {
  external_id: string; season: number; week: number; season_type: 'REG' | 'POST'; game_type: string | null;
  game_date: string; kickoff: Date | null; weekday: string | null; status: GameSummary['status'];
  stadium: string | null; roof: string | null; surface: string | null; overtime: boolean | null;
  away_team_id: number; home_team_id: number; away_score: number | null; home_score: number | null;
}

const GAME_COLS = `external_id, season, week, season_type, game_type, game_date, kickoff, weekday, status, stadium, roof,
  surface, overtime, away_team_id, home_team_id, away_score, home_score`;

/** All games of a season with each team's record ENTERING the game (from completed games only). */
export function seasonGames(season: number): Promise<GameSummary[]> {
  return cached(`games:${season}`, TTL.schedule, async () => {
    const [rows, { byId }] = await Promise.all([
      q<GameRow>(`SELECT ${GAME_COLS} FROM games WHERE season = $1 ORDER BY kickoff NULLS LAST, external_id`, [season]),
      teamMaps(),
    ]);
    const rec = new Map<number, TeamRecord>();
    const get = (id: number) => {
      if (!rec.has(id)) rec.set(id, { wins: 0, losses: 0, ties: 0 });
      return rec.get(id)!;
    };
    return rows.map((r) => {
      const a = byId.get(r.away_team_id)!;
      const h = byId.get(r.home_team_id)!;
      const ar = { ...get(r.away_team_id) };
      const hr = { ...get(r.home_team_id) };
      if (r.status === 'final' && r.away_score != null && r.home_score != null && r.season_type === 'REG') {
        const A = get(r.away_team_id), H = get(r.home_team_id);
        if (r.away_score > r.home_score) { A.wins++; H.losses++; }
        else if (r.home_score > r.away_score) { H.wins++; A.losses++; }
        else { A.ties++; H.ties++; }
      }
      const side = (t: typeof a, score: number | null, record: TeamRecord) => ({
        abbr: t.abbr, name: t.name, nickname: t.nickname, logo: t.logo, primary: t.primary, secondary: t.secondary,
        score: r.status === 'final' ? score : null, record,
      });
      return {
        id: r.external_id, season: r.season, week: r.week, seasonType: r.season_type, gameType: r.game_type,
        date: r.game_date, kickoff: r.kickoff ? new Date(r.kickoff).toISOString() : null, weekday: r.weekday,
        status: r.status, stadium: r.stadium, roof: r.roof, surface: r.surface, overtime: r.overtime,
        away: side(a, r.away_score, ar), home: side(h, r.home_score, hr),
      } satisfies GameSummary;
    });
  });
}

export async function seasonRecords(season: number): Promise<Map<string, TeamRecord>> {
  const games = await seasonGames(season);
  const out = new Map<string, TeamRecord>();
  for (const g of games) {
    if (g.seasonType !== 'REG') continue;
    for (const side of [g.away, g.home]) out.set(side.abbr, { ...(side.record ?? { wins: 0, losses: 0, ties: 0 }) });
    if (g.status === 'final' && g.away.score != null && g.home.score != null) {
      const A = out.get(g.away.abbr)!, H = out.get(g.home.abbr)!;
      if (g.away.score > g.home.score) { A.wins++; H.losses++; } else if (g.home.score > g.away.score) { H.wins++; A.losses++; } else { A.ties++; H.ties++; }
    }
  }
  return out;
}

export interface GameFilters { season?: number; week?: number; team?: string; date?: string }

export async function listGames(f: GameFilters): Promise<GameSummary[]> {
  const meta = await getMeta();
  const season = f.season ?? meta.currentSeason;
  let games = await seasonGames(season);
  if (f.week != null) games = games.filter((g) => g.week === f.week);
  if (f.team) games = games.filter((g) => g.away.abbr === f.team!.toUpperCase() || g.home.abbr === f.team!.toUpperCase());
  if (f.date) games = games.filter((g) => g.date === f.date);
  return games;
}

export async function findGame(id: string): Promise<GameSummary | null> {
  const row = await one<{ season: number }>('SELECT season FROM games WHERE external_id = $1', [id]);
  if (!row) return null;
  return (await seasonGames(row.season)).find((g) => g.id === id) ?? null;
}

export async function getGame(id: string): Promise<GameDetail | null> {
  const game = await findGame(id);
  if (!game) return null;
  const { byAbbr } = await teamMaps();
  const h2h = await q<{ external_id: string; season: number }>(
    `SELECT external_id, season FROM games g
       WHERE g.status = 'final' AND g.external_id <> $1
         AND ((g.home_team_id = $2 AND g.away_team_id = $3) OR (g.home_team_id = $3 AND g.away_team_id = $2))
       ORDER BY g.kickoff DESC LIMIT 5`,
    [id, byAbbr.get(game.home.abbr)!.id, byAbbr.get(game.away.abbr)!.id],
  );
  const headToHead: GameSummary[] = [];
  for (const r of h2h) {
    const g = (await seasonGames(r.season)).find((x) => x.id === r.external_id);
    if (g) headToHead.push(g);
  }
  return {
    game,
    awayTeam: byAbbr.get(game.away.abbr)!,
    homeTeam: byAbbr.get(game.home.abbr)!,
    live: {
      available: false,
      reason: 'nflverse publishes schedules, final scores and play-by-play after games. It does not provide live quarter, clock or in-game score data, so GRIDIRON never displays them.',
    },
    headToHead,
  };
}

export function getMeta(): Promise<MetaResponse> {
  return cached('meta', TTL.schedule, async () => {
    const rows = await q<{ season: number; week: number; pending: number }>(
      `SELECT season, week, COUNT(*) FILTER (WHERE status <> 'final') AS pending FROM games GROUP BY season, week ORDER BY season, week`,
    );
    const weeksBySeason: Record<string, number[]> = {};
    for (const r of rows) (weeksBySeason[r.season] ??= []).push(r.week);
    const seasons = Object.keys(weeksBySeason).map(Number).sort((a, b) => b - a);
    const currentSeason = seasons.includes(CURRENT_SEASON) ? CURRENT_SEASON : seasons[0] ?? CURRENT_SEASON;
    const cur = rows.filter((r) => r.season === currentSeason);
    const pending = cur.find((r) => r.pending > 0);
    const currentWeek = pending?.week ?? cur.at(-1)?.week ?? null;
    return { currentSeason, currentWeek, seasons, weeksBySeason, generatedAt: new Date().toISOString(), mode: 'live-api' as const };
  });
}
