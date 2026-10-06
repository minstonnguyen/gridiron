import { q } from '../lib/db.js';
import { getLineups } from './lineups.js';
import { buildCards } from './cards.js';
import type { KeyMatchup, LineupsResponse, MatchupResponse, PlayerCardData, Slot, TeamLineup, UnitEdge } from '../../src/types/api.js';

const val = (p: PlayerCardData | null | undefined) => p?.rating?.overall ?? null;
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
const players = (slots: Slot[], pred: (s: Slot) => boolean) => slots.filter(pred).map((s) => s.player).filter((p): p is PlayerCardData => !!p);
const weighted = (parts: [number | null, number][]) => {
  const ok = parts.filter(([v]) => v != null) as [number, number][];
  const w = ok.reduce((a, [, x]) => a + x, 0);
  return w ? Math.round((ok.reduce((a, [v, x]) => a + v * x, 0) / w) * 10) / 10 : null;
};

export function units(t: TeamLineup) {
  const o = t.offense, d = t.defense;
  const qb = players(o, (s) => s.key === 'QB');
  const rb = players(o, (s) => s.key === 'RB');
  const wr = players(o, (s) => s.key.startsWith('WR'));
  const te = players(o, (s) => s.key === 'TE');
  const ol = players(o, (s) => ['LT', 'LG', 'C', 'RG', 'RT'].includes(s.key));
  const rush = players(d, (s) => s.key.startsWith('EDGE') || s.key.startsWith('DL'));
  const lb = players(d, (s) => s.key.startsWith('LB'));
  const sec = [...players(d, (s) => s.key.startsWith('CB') || s.key.startsWith('S')), ...(t.nickel?.player ? [t.nickel.player] : [])];
  const st = players(t.specialists, () => true);
  const u = {
    QB: { v: avg(qb.map(val)), p: qb }, RB: { v: avg(rb.map(val)), p: rb }, WR: { v: avg(wr.map(val)), p: wr },
    TE: { v: avg(te.map(val)), p: te }, OL: { v: avg(ol.map(val)), p: ol }, 'PASS RUSH': { v: avg(rush.map(val)), p: rush },
    LB: { v: avg(lb.map(val)), p: lb }, SECONDARY: { v: avg(sec.map(val)), p: sec },
    DEFENSE: { v: avg([...rush, ...lb, ...sec].map(val)), p: [...rush, ...lb, ...sec] },
    'SPECIAL TEAMS': { v: avg(st.map(val)), p: st },
  };
  const offense = weighted([[u.QB.v, 0.35], [u.WR.v, 0.2], [u.OL.v, 0.2], [u.TE.v, 0.1], [u.RB.v, 0.15]]);
  const defense = weighted([[u['PASS RUSH'].v, 0.4], [u.LB.v, 0.2], [u.SECONDARY.v, 0.4]]);
  const passO = weighted([[u.QB.v, 0.5], [u.WR.v, 0.25], [u.TE.v, 0.1], [u.OL.v, 0.15]]);
  const runO = weighted([[u.RB.v, 0.5], [u.OL.v, 0.5]]);
  const passD = weighted([[u['PASS RUSH'].v, 0.45], [u.SECONDARY.v, 0.55]]);
  const runD = weighted([[u['PASS RUSH'].v, 0.5], [u.LB.v, 0.5]]);
  return { u, offense, defense, passO, runO, passD, runD, overall: weighted([[offense, 0.55], [defense, 0.45]]) };
}

const EDGE_THRESHOLD = 1.5;
function edgeOf(a: number | null, h: number | null): UnitEdge['edge'] {
  if (a == null || h == null) return 'unavailable';
  if (Math.abs(a - h) < EDGE_THRESHOLD) return 'even';
  return a > h ? 'away' : 'home';
}

export function computeMatchup(l: LineupsResponse, injuries: { away: PlayerCardData[]; home: PlayerCardData[] }): MatchupResponse {
  const A = units(l.away), H = units(l.home);
  const keys = ['QB', 'RB', 'WR', 'TE', 'OL', 'PASS RUSH', 'LB', 'SECONDARY', 'DEFENSE', 'SPECIAL TEAMS'] as const;
  const unitsOut: UnitEdge[] = keys.map((k) => ({
    unit: k, away: A.u[k].v, home: H.u[k].v, edge: edgeOf(A.u[k].v, H.u[k].v),
    margin: A.u[k].v != null && H.u[k].v != null ? Math.round((A.u[k].v! - H.u[k].v!) * 10) / 10 : null,
    awayPlayers: A.u[k].p.map((p) => p.name), homePlayers: H.u[k].p.map((p) => p.name),
  }));
  const a = l.away.team.abbr, h = l.home.team.abbr;
  const km = (title: string, ot: string, dt: string, o: number | null, d: number | null, note: string): KeyMatchup => ({
    title, offenseTeam: ot, defenseTeam: dt, offense: o, defense: d, note,
    edge: o == null || d == null ? 'unavailable' : Math.abs(o - d) < EDGE_THRESHOLD ? 'even' : o > d ? 'offense' : 'defense',
  });
  const topWr = (t: TeamLineup) => players(t.offense, (s) => s.key.startsWith('WR')).sort((x, y) => (val(y) ?? 0) - (val(x) ?? 0))[0];
  const topCb = (t: TeamLineup) => players(t.defense, (s) => s.key.startsWith('CB')).sort((x, y) => (val(y) ?? 0) - (val(x) ?? 0))[0];
  const keyMatchups: KeyMatchup[] = [
    km(`${a} PASS ATTACK vs ${h} PASS DEFENSE`, a, h, A.passO, H.passD, 'QB 50% · WR 25% · OL 15% · TE 10% vs pass rush 45% · secondary 55%'),
    km(`${h} PASS ATTACK vs ${a} PASS DEFENSE`, h, a, H.passO, A.passD, 'QB 50% · WR 25% · OL 15% · TE 10% vs pass rush 45% · secondary 55%'),
    km(`${a} RUN GAME vs ${h} RUN DEFENSE`, a, h, A.runO, H.runD, 'RB 50% · OL 50% vs front 50% · LB 50%'),
    km(`${h} RUN GAME vs ${a} RUN DEFENSE`, h, a, H.runO, A.runD, 'RB 50% · OL 50% vs front 50% · LB 50%'),
  ];
  const wa = topWr(l.away), cbh = topCb(l.home), wh = topWr(l.home), cba = topCb(l.away);
  if (wa && cbh) keyMatchups.push(km(`${wa.name} vs ${cbh.name}`, a, h, val(wa), val(cbh), 'Top-rated WR vs top-rated CB (alignment not guaranteed)'));
  if (wh && cba) keyMatchups.push(km(`${wh.name} vs ${cba.name}`, h, a, val(wh), val(cba), 'Top-rated WR vs top-rated CB (alignment not guaranteed)'));
  const all = [...l.away.offense, ...l.away.defense, ...l.home.offense, ...l.home.defense]
    .map((s) => s.player).filter((p): p is PlayerCardData => !!p && p.rating?.overall != null);
  const watch = all
    .sort((x, y) => (val(y)! + (y.rating?.recentForm ?? 50) / 20) - (val(x)! + (x.rating?.recentForm ?? 50) / 20))
    .slice(0, 8);
  return {
    gameId: l.gameId,
    label: 'ANALYTICS MATCHUP EDGE',
    disclaimer: 'Generated from GRIDIRON Analytics Ratings of depth-chart starters. This is an analytics comparison, not an official prediction or betting line.',
    units: unitsOut,
    overall: { away: A.overall, home: H.overall, edge: edgeOf(A.overall, H.overall), margin: A.overall != null && H.overall != null ? Math.round((A.overall - H.overall) * 10) / 10 : null },
    keyMatchups,
    watch,
    injuries,
  };
}

/** Injury-report players for both teams in the game week (designations only, as reported). */
export async function gameInjuries(gameId: string, l: LineupsResponse) {
  const g = (await q<any>('SELECT season, week, away_team_id, home_team_id FROM games WHERE external_id = $1', [gameId]))[0];
  if (!g) return { away: [], home: [] };
  const rows = await q<{ player_id: number; team_id: number }>(
    `SELECT player_id, team_id FROM injuries WHERE season = $1 AND week = $2 AND team_id = ANY($3)
       AND (game_status IS NOT NULL OR practice_status ILIKE 'did not%')`, [g.season, g.week, [g.away_team_id, g.home_team_id]]);
  const cards = await buildCards(rows.map((r) => ({ playerId: r.player_id, teamId: r.team_id })), { season: g.season, week: g.week });
  const list = (tid: number) => rows.filter((r) => r.team_id === tid).map((r) => cards.get(r.player_id)).filter((x): x is PlayerCardData => !!x)
    .sort((x, y) => (y.rating?.overall ?? 0) - (x.rating?.overall ?? 0));
  void l;
  return { away: list(g.away_team_id), home: list(g.home_team_id) };
}

export async function getMatchup(gameId: string): Promise<MatchupResponse | null> {
  const l = await getLineups(gameId);
  if (!l) return null;
  return computeMatchup(l, await gameInjuries(gameId, l));
}
