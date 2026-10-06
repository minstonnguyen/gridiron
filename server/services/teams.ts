import { q } from '../lib/db.js';
import { cached, TTL } from '../lib/cache.js';
import type { TeamLite, TeamRecord } from '../../src/types/api.js';

interface TeamRow {
  id: number; abbreviation: string; name: string; nickname: string | null; city: string | null;
  conference: string | null; division: string | null; logo_url: string | null; wordmark_url: string | null;
  primary_color: string | null; secondary_color: string | null; tertiary_color: string | null; stadium: string | null;
}

export function toTeam(r: TeamRow): TeamLite {
  return {
    id: r.id, abbr: r.abbreviation, name: r.name, nickname: r.nickname, city: r.city, conference: r.conference,
    division: r.division, logo: r.logo_url, wordmark: r.wordmark_url, primary: r.primary_color,
    secondary: r.secondary_color, tertiary: r.tertiary_color, stadium: r.stadium,
  };
}

export function listTeams(): Promise<TeamLite[]> {
  return cached('teams', TTL.teams, async () => {
    const rows = await q<TeamRow>('SELECT * FROM teams ORDER BY conference, division, name');
    return rows.map(toTeam);
  });
}

export async function teamMaps() {
  const teams = await listTeams();
  return {
    teams,
    byId: new Map(teams.map((t) => [t.id, t])),
    byAbbr: new Map(teams.map((t) => [t.abbr, t])),
  };
}

export async function resolveTeam(idOrAbbr: string): Promise<TeamLite | null> {
  const { byAbbr, byId } = await teamMaps();
  return byAbbr.get(idOrAbbr.toUpperCase()) ?? byId.get(Number(idOrAbbr)) ?? null;
}

export function emptyRecord(): TeamRecord {
  return { wins: 0, losses: 0, ties: 0 };
}
