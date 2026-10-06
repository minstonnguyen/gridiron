import { q } from '../lib/db.js';
import { getMeta, seasonGames } from './games.js';
import { listTeams } from './teams.js';
import type { SearchResult } from '../../src/types/api.js';
import { toListItem } from './players.js';

/** Global search: players (name prefix/trigram), teams (abbr/name), games (current season, by team). */
export async function search(term: string, limit = 8): Promise<SearchResult> {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return { players: [], teams: [], games: [] };
  const meta = await getMeta();
  const [players, teams, games] = await Promise.all([
    q<any>(
      `SELECT p.gsis_id, p.display_name, p.position, p.headshot_url, p.jersey_number,
              r.rating_position, r.overall_score, r.tier, r.confidence, r.position_rank, t.abbreviation AS team, t.primary_color
         FROM players p
         LEFT JOIN LATERAL (SELECT * FROM player_ratings pr WHERE pr.player_id = p.id
                            ORDER BY pr.season DESC LIMIT 1) r ON true
         LEFT JOIN teams t ON t.id = COALESCE(r.team_id, p.latest_team_id)
        WHERE p.search_text LIKE $1 OR p.search_text % $2
        ORDER BY (p.search_text LIKE $3) DESC, (r.season IS NOT NULL) DESC, r.season DESC NULLS LAST,
                 r.overall_score DESC NULLS LAST, similarity(p.search_text, $2) DESC
        LIMIT $4`, [`%${t}%`, t, `${t}%`, limit]),
    listTeams(),
    seasonGames(meta.currentSeason),
  ]);
  const tm = teams.filter((x) => x.abbr.toLowerCase() === t || x.name.toLowerCase().includes(t) || (x.city ?? '').toLowerCase().includes(t)).slice(0, 4);
  const abbrs = new Set(tm.map((x) => x.abbr));
  const gm = games.filter((g) => abbrs.has(g.away.abbr) || abbrs.has(g.home.abbr))
    .filter((g) => g.status !== 'final').slice(0, 4);
  return { players: players.map(toListItem), teams: tm, games: gm };
}
