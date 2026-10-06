import { q, one } from '../lib/db.js';
import { buildCards } from './cards.js';
import { getMeta, listGames, seasonRecords } from './games.js';
import { listPlayers, LIST_COLS, toListItem } from './players.js';
import { resolveTeam } from './teams.js';
import type { DepthChartResponse, PlayerCardData, RosterEntry, TeamDetail } from '../../src/types/api.js';

export async function getTeamDetail(idOrAbbr: string, season?: number): Promise<TeamDetail | null> {
  const team = await resolveTeam(idOrAbbr);
  if (!team) return null;
  const meta = await getMeta();
  const S = season ?? meta.currentSeason;
  const [records, schedule, top] = await Promise.all([
    seasonRecords(S), listGames({ season: S, team: team.abbr }), listPlayers({ season: S, team: team.abbr, pageSize: 5 }),
  ]);
  let topPlayers = top.items;
  if (!topPlayers.length) topPlayers = (await listPlayers({ season: S - 1, team: team.abbr, pageSize: 5 })).items;
  const wk = await one<{ week: number }>(
    'SELECT MAX(week) AS week FROM injuries WHERE team_id = $1 AND season = $2', [team.id, S]);
  let injuries: PlayerCardData[] = [];
  if (wk?.week != null) {
    const rows = await q<{ player_id: number }>(
      `SELECT player_id FROM injuries WHERE team_id = $1 AND season = $2 AND week = $3
         AND (game_status IS NOT NULL OR practice_status ILIKE 'did not%')`, [team.id, S, wk.week]);
    const cards = await buildCards(rows.map((r) => ({ playerId: r.player_id, teamId: team.id })), { season: S, week: wk.week });
    injuries = [...cards.values()].sort((a, b) => (b.rating?.overall ?? 0) - (a.rating?.overall ?? 0));
  }
  return { team, season: S, record: records.get(team.abbr) ?? { wins: 0, losses: 0, ties: 0 }, schedule, topPlayers, injuries };
}

export async function getTeamRoster(idOrAbbr: string, season?: number): Promise<RosterEntry[] | null> {
  const team = await resolveTeam(idOrAbbr);
  if (!team) return null;
  const S = season ?? (await getMeta()).currentSeason;
  const wk = await one<{ week: number }>('SELECT MAX(week) AS week FROM rosters WHERE team_id = $1 AND season = $2', [team.id, S]);
  if (wk?.week == null) return [];
  const rows = await q<any>(
    `SELECT ${LIST_COLS}, ro.position AS roster_position, ro.roster_status, ro.week, ro.jersey_number AS roster_jersey
       FROM rosters ro JOIN players p ON p.id = ro.player_id
       LEFT JOIN LATERAL (
         SELECT * FROM player_ratings pr WHERE pr.player_id = p.id AND pr.season IN ($3, $3 - 1)
         ORDER BY (pr.overall_score IS NOT NULL) DESC, pr.season DESC LIMIT 1) r ON true
       LEFT JOIN teams t ON t.id = ro.team_id
      WHERE ro.team_id = $1 AND ro.week = $2 AND ro.season = $3 AND ro.roster_status <> 'CUT'
      ORDER BY ro.position, r.overall_score DESC NULLS LAST`, [team.id, wk.week, S]);
  return rows.map((r) => ({ ...toListItem(r), jersey: r.roster_jersey ?? r.jersey_number, rosterPosition: r.roster_position, rosterStatus: r.roster_status, week: r.week }));
}

export async function getTeamDepthChart(idOrAbbr: string, season?: number, week?: number): Promise<DepthChartResponse | null> {
  const team = await resolveTeam(idOrAbbr);
  if (!team) return null;
  const meta = await getMeta();
  const S = season ?? meta.currentSeason;
  const W = week ?? 99;
  const wk = await one<{ week: number; source: string }>(
    `SELECT week, source FROM depth_charts WHERE team_id = $1 AND season = $2 AND week <= $3 ORDER BY week DESC LIMIT 1`, [team.id, S, W]);
  if (!wk) return { season: S, week: null, source: null, entries: [] };
  const rows = await q<any>(
    `SELECT d.position AS dpos, d.position_group, d.slot, d.depth, ${LIST_COLS}
       FROM depth_charts d JOIN players p ON p.id = d.player_id
       LEFT JOIN LATERAL (
         SELECT * FROM player_ratings pr WHERE pr.player_id = p.id AND pr.season IN ($3, $3 - 1)
         ORDER BY (pr.overall_score IS NOT NULL) DESC, pr.season DESC LIMIT 1) r ON true
       LEFT JOIN teams t ON t.id = d.team_id
      WHERE d.team_id = $1 AND d.week = $2 AND d.season = $3
      ORDER BY d.position_group, d.slot NULLS LAST, d.position, d.depth`, [team.id, wk.week, S]);
  return {
    season: S, week: wk.week, source: wk.source,
    entries: rows.map((r) => ({ position: r.dpos, group: r.position_group, slot: r.slot, depth: r.depth, player: toListItem(r) })),
  };
}
