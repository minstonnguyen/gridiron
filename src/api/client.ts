import type {
  AdminHealth, DepthChartResponse, GameDetail, GameLogRow, GameSummary, HomeResponse, LineupsResponse, MatchupResponse,
  MetaResponse, PlayerListItem, PlayerProfile, PlayerRatingResponse, PlayerStatsResponse, PlayersPage, RosterEntry,
  SearchResult, TeamDetail, TeamLite,
} from '@/types/api';

/**
 * Data access layer.
 * - `api` mode: calls the TypeScript backend (/api/*) which queries PostgreSQL.
 * - `static` mode (GitHub Pages): reads JSON files that the export step writes by calling the SAME backend
 *   service functions against the SAME PostgreSQL database, so both modes return identical payloads.
 */
export const DATA_MODE: 'api' | 'static' = (import.meta.env.VITE_DATA_MODE as 'api' | 'static') ?? 'api';
const API_BASE: string = (import.meta.env.VITE_API_BASE as string) ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const memo = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string): Promise<T> {
  if (memo.has(url)) return memo.get(url) as Promise<T>;
  const p = (async () => {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      throw new ApiError(0, 'network', 'Network error — the data service could not be reached.');
    }
    if (!res.ok) {
      let code = res.status === 404 ? 'not_found' : res.status === 503 ? 'database_unavailable' : 'server_error';
      let message = res.statusText;
      try {
        const body = await res.json();
        code = body.error ?? code;
        message = body.message ?? message;
      } catch { /* static 404 page */ }
      throw new ApiError(res.status, code, message);
    }
    return (await res.json()) as T;
  })();
  memo.set(url, p);
  p.catch(() => memo.delete(url));
  return p;
}

const api = <T>(path: string) => fetchJson<T>(`${API_BASE}/api${path}`);
const file = <T>(path: string) => fetchJson<T>(`./data/${path}`);

interface StaticGameBundle { detail: GameDetail; lineups: LineupsResponse; matchup: MatchupResponse }
interface StaticPlayerBundle { profile: PlayerProfile; stats: PlayerStatsResponse; ratings: Record<string, Pick<PlayerRatingResponse, 'rating' | 'components'>>; latestSeason: number | null }
const FORMULA = { weights: { efficiency: 0.4, advanced: 0.25, production: 0.2, consistency: 0.1, recent_form: 0.05 }, version: 'gar-1.0' };
interface SearchIndexEntry extends PlayerListItem { s: string }

export const client = {
  meta: () => (DATA_MODE === 'static' ? file<MetaResponse>('meta.json') : api<MetaResponse>('/meta')),
  home: () => (DATA_MODE === 'static' ? file<HomeResponse>('home.json') : api<HomeResponse>('/home')),
  teams: () => (DATA_MODE === 'static' ? file<TeamLite[]>('teams.json') : api<TeamLite[]>('/teams')),

  /** Full season schedule; filtering by week/team/date happens client-side on this cached list. */
  seasonGames: (season: number) =>
    DATA_MODE === 'static' ? file<GameSummary[]>(`games/season-${season}.json`) : api<GameSummary[]>(`/games?season=${season}`),

  game: (id: string) =>
    DATA_MODE === 'static' ? file<StaticGameBundle>(`games/${id}.json`).then((b) => b.detail) : api<GameDetail>(`/games/${id}`),
  lineups: (id: string) =>
    DATA_MODE === 'static' ? file<StaticGameBundle>(`games/${id}.json`).then((b) => b.lineups) : api<LineupsResponse>(`/games/${id}/lineups`),
  matchup: (id: string) =>
    DATA_MODE === 'static' ? file<StaticGameBundle>(`games/${id}.json`).then((b) => b.matchup) : api<MatchupResponse>(`/games/${id}/matchup`),

  /** Rated players for a season + position (≤ a few hundred rows); team filter & paging applied client-side. */
  players: async (season: number, position: string): Promise<PlayersPage> =>
    DATA_MODE === 'static'
      ? file<PlayersPage>(`players/${season}/${position}.json`)
      : api<PlayersPage>(`/players?season=${season}${position !== 'ALL' ? `&position=${position}` : ''}&pageSize=200`),

  player: (id: string) =>
    DATA_MODE === 'static' ? file<StaticPlayerBundle>(`players/${id}.json`).then((b) => b.profile) : api<PlayerProfile>(`/players/${id}`),
  playerStats: (id: string) =>
    DATA_MODE === 'static' ? file<StaticPlayerBundle>(`players/${id}.json`).then((b) => b.stats) : api<PlayerStatsResponse>(`/players/${id}/stats`),
  playerRating: async (id: string, season?: number): Promise<PlayerRatingResponse> => {
    if (DATA_MODE !== 'static') return api<PlayerRatingResponse>(`/players/${id}/rating${season ? `?season=${season}` : ''}`);
    const b = await file<StaticPlayerBundle>(`players/${id}.json`);
    const key = season ?? b.latestSeason;
    const r = key != null ? b.ratings[key] : undefined;
    return { rating: r?.rating ?? null, components: r?.components ?? [], history: b.profile.ratings, formula: FORMULA };
  },
  gameLog: (id: string) =>
    DATA_MODE === 'static' ? file<GameLogRow[]>(`players/${id}/log.json`) : api<GameLogRow[]>(`/players/${id}/game-log`),

  team: (abbr: string, season: number) =>
    DATA_MODE === 'static' ? file<TeamDetail>(`teams/${abbr}/${season}/detail.json`) : api<TeamDetail>(`/teams/${abbr}?season=${season}`),
  roster: (abbr: string, season: number) =>
    DATA_MODE === 'static' ? file<RosterEntry[]>(`teams/${abbr}/${season}/roster.json`) : api<RosterEntry[]>(`/teams/${abbr}/roster?season=${season}`),
  depthChart: (abbr: string, season: number) =>
    DATA_MODE === 'static' ? file<DepthChartResponse>(`teams/${abbr}/${season}/depth.json`) : api<DepthChartResponse>(`/teams/${abbr}/depth-chart?season=${season}`),

  search: async (q: string, currentSeason: number): Promise<SearchResult> => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return { players: [], teams: [], games: [] };
    if (DATA_MODE !== 'static') return api<SearchResult>(`/search?q=${encodeURIComponent(t)}`);
    const letter = (t[0].match(/[a-z]/) ? t[0] : '_');
    const [idx, teams, games] = await Promise.all([
      file<SearchIndexEntry[]>(`search/${letter}.json`).catch(() => [] as SearchIndexEntry[]),
      client.teams(),
      client.seasonGames(currentSeason).catch(() => [] as GameSummary[]),
    ]);
    const players = idx.filter((p) => p.s.includes(t)).sort((a, b) => Number(b.s.startsWith(t)) - Number(a.s.startsWith(t)) || (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 8);
    const tm = teams.filter((x) => x.abbr.toLowerCase() === t || x.name.toLowerCase().includes(t)).slice(0, 4);
    const ab = new Set(tm.map((x) => x.abbr));
    const gm = games.filter((g) => (ab.has(g.away.abbr) || ab.has(g.home.abbr)) && g.status !== 'final').slice(0, 4);
    return { players, teams: tm, games: gm };
  },

  adminHealth: (token?: string) =>
    DATA_MODE === 'static'
      ? file<AdminHealth>('admin/health.json')
      : fetchAdmin<AdminHealth>('GET', '/admin/health', token),
  adminRun: (route: string, token: string) => fetchAdmin<{ started: boolean; message: string }>('POST', `/admin/${route}`, token),
};

async function fetchAdmin<T>(method: string, path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { method, headers: { Authorization: `Bearer ${token ?? ''}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new ApiError(res.status, body.error ?? 'error', body.message ?? res.statusText);
  return body as T;
}
