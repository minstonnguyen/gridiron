import { q, one } from '../lib/db.js';
import { buildCards } from './cards.js';
import { teamMaps } from './teams.js';
import type { LineupsResponse, PlayerCardData, Slot, TeamLineup } from '../../src/types/api.js';

interface DepthRow {
  player_id: number; team_id: number; season: number; week: number; position: string; position_group: string;
  formation: string | null; slot: number | null; depth: number; source: string; snapshot_at: Date | null;
}
interface Chain { position: string; slot: number; rows: DepthRow[] }

const OFF_SLOTS: { key: string; label: string; labels: string[]; fallback?: string[] }[] = [
  { key: 'QB', label: 'QB', labels: ['QB'] },
  { key: 'RB', label: 'RB', labels: ['RB', 'HB', 'TB'], fallback: ['FB'] },
  { key: 'WR1', label: 'WR', labels: ['WR', 'LWR', 'RWR', 'X', 'Z', 'SWR', 'SLWR', 'SRWR', 'F'] },
  { key: 'WR2', label: 'WR', labels: ['WR', 'LWR', 'RWR', 'X', 'Z', 'SWR', 'SLWR', 'SRWR', 'F'] },
  { key: 'WR3', label: 'WR', labels: ['WR', 'SWR', 'SLWR', 'SRWR', 'LWR', 'RWR', 'X', 'Z', 'F'] },
  { key: 'TE', label: 'TE', labels: ['TE', 'Y'] },
  { key: 'LT', label: 'LT', labels: ['LT'], fallback: ['T', 'OT', 'OL'] },
  { key: 'LG', label: 'LG', labels: ['LG'], fallback: ['G', 'OG', 'OL'] },
  { key: 'C', label: 'C', labels: ['C', 'OC'], fallback: ['OL'] },
  { key: 'RG', label: 'RG', labels: ['RG'], fallback: ['G', 'OG', 'OL'] },
  { key: 'RT', label: 'RT', labels: ['RT'], fallback: ['T', 'OT', 'OL'] },
];

const NICKEL = new Set(['NB', 'NCB', 'NKL', 'NICKE', 'NDB', 'N', 'STAR']);
type Role = 'EDGE' | 'DL' | 'LB' | 'CB' | 'S';

function labelRole(label: string, front: string): Role | null {
  const l = label.toUpperCase();
  if (['FS', 'SS', 'S', 'SAF'].includes(l)) return 'S';
  if (['CB', 'LCB', 'RCB', 'DB'].includes(l)) return 'CB';
  if (['NT', 'DT', 'LDT', 'RDT', 'DL', 'UT'].includes(l)) return 'DL';
  if (['EDGE', 'RUSH', 'LEO', 'LOLB', 'ROLB', 'OLB'].includes(l)) return 'EDGE';
  if (['LDE', 'RDE', 'DE'].includes(l)) return front === '3-4' ? 'DL' : 'EDGE';
  if (['WLB', 'SLB', 'SAM', 'WILL'].includes(l)) return front === '3-4' ? 'EDGE' : 'LB';
  if (['MLB', 'ILB', 'LILB', 'RILB', 'MIKE', 'LB', 'MAC'].includes(l)) return 'LB';
  return null;
}

function chainsOf(rows: DepthRow[], group: string): Chain[] {
  const m = new Map<string, Chain>();
  for (const r of rows) {
    if (r.position_group !== group) continue;
    const k = `${r.position}|${r.slot ?? 1}`;
    if (!m.has(k)) m.set(k, { position: r.position, slot: r.slot ?? 1, rows: [] });
    m.get(k)!.rows.push(r);
  }
  const chains = [...m.values()];
  for (const c of chains) c.rows.sort((a, b) => a.depth - b.depth);
  return chains.sort((a, b) => a.rows[0].depth - b.rows[0].depth || a.slot - b.slot);
}

function takeChain(chains: Chain[], labels: string[], used: Set<number>): Chain | null {
  for (const c of chains) {
    if (!labels.includes(c.position)) continue;
    const starter = c.rows.find((r) => !used.has(r.player_id));
    if (starter && starter.depth <= 2) return c;
  }
  return null;
}

function slotFrom(key: string, label: string, chain: Chain | null, used: Set<number>, cards: Map<number, PlayerCardData>): Slot {
  if (!chain) return { key, label, player: null, backups: [] };
  const avail = chain.rows.filter((r) => !used.has(r.player_id));
  const starter = avail[0];
  used.add(starter.player_id);
  return {
    key, label,
    player: cards.get(starter.player_id) ?? null,
    backups: avail.slice(1, 3).map((r) => cards.get(r.player_id)).filter((x): x is PlayerCardData => !!x),
  };
}

function detectFront(rows: DepthRow[]): '3-4' | '4-3' | 'UNKNOWN' {
  const f = rows.find((r) => r.position_group === 'DEF' && r.formation && /3-4|4-3/.test(r.formation))?.formation ?? '';
  if (f.includes('3-4')) return '3-4';
  if (f.includes('4-3')) return '4-3';
  const starters = new Set(rows.filter((r) => r.position_group === 'DEF' && r.depth === 1).map((r) => r.position));
  if (starters.has('NT') && ['LOLB', 'ROLB', 'OLB', 'RUSH'].some((x) => starters.has(x))) return '3-4';
  if (['LDT', 'RDT'].every((x) => starters.has(x)) || starters.has('DT')) return '4-3';
  return 'UNKNOWN';
}

function buildTeam(rows: DepthRow[], cards: Map<number, PlayerCardData>): Omit<TeamLineup, 'team'> {
  const off = chainsOf(rows, 'OFF');
  const used = new Set<number>();
  const offense: Slot[] = OFF_SLOTS.map((s) => {
    let c = takeChain(off, s.labels, used);
    if (!c && s.fallback) c = takeChain(off, s.fallback, used);
    return slotFrom(s.key, s.label, c, used, cards);
  });

  const front = detectFront(rows);
  const def = chainsOf(rows, 'DEF');
  const dused = new Set<number>();
  const pools: Record<Role, Chain[]> = { EDGE: [], DL: [], LB: [], CB: [], S: [] };
  let nickelChain: Chain | null = null;
  const seen = new Set<number>();
  for (const c of def) {
    const st = c.rows[0];
    if (seen.has(st.player_id)) continue;
    if (NICKEL.has(c.position)) { nickelChain ??= c; continue; }
    const card = cards.get(st.player_id);
    const rp = card?.ratingPosition as Role | undefined;
    const role: Role | null = rp && ['EDGE', 'DL', 'LB', 'CB', 'S'].includes(rp) ? rp : labelRole(c.position, front);
    if (!role) continue;
    seen.add(st.player_id);
    pools[role].push(c);
  }
  // Base personnel: 3-4 => 3 DL / 2 EDGE / 2 LB, 4-3 => 2 DL / 2 EDGE / 3 LB; adapt when the chart differs.
  const dlCap = front === '3-4' || pools.DL.length >= 3 && pools.LB.length <= 2 ? 3 : 2;
  const lbCap = dlCap === 3 ? 2 : 3;
  const caps: Record<Role, number> = { EDGE: 2, DL: dlCap, LB: lbCap, CB: 2, S: 2 };
  // If fewer EDGE than 2, borrow from surplus DL/LB so the front still has 4-5 bodies.
  const defense: Slot[] = [];
  const mk = (role: Role, i: number, c: Chain | null) => {
    const label = role === 'DL' ? (c?.position === 'NT' ? 'NT' : 'DT') : role;
    return slotFrom(`${role}${i + 1}`, label, c, dused, cards);
  };
  const order: Role[] = ['EDGE', 'DL', 'LB', 'CB', 'S'];
  for (const role of order) {
    const list = pools[role].slice(0, caps[role]);
    for (let i = 0; i < Math.max(list.length, role === 'LB' || role === 'DL' ? 0 : caps[role]); i++) defense.push(mk(role, i, list[i] ?? null));
  }
  const total = defense.filter((s) => s.player).length;
  if (total < 11) {
    // Fill remaining base spots with the best leftover starters (keeps 11 on the field when the chart is unusual).
    const leftovers = order.flatMap((r) => pools[r].slice(caps[r]).map((c) => [r, c] as const));
    for (const [r, c] of leftovers) {
      if (defense.filter((s) => s.player).length >= 11) break;
      defense.push(mk(r, defense.filter((s) => s.key.startsWith(r)).length, c));
    }
  }
  const nickel = nickelChain ? slotFrom('NB', 'NB', nickelChain, dused, cards) : null;

  const st = chainsOf(rows, 'ST');
  const sused = new Set<number>();
  const specialists = [
    slotFrom('K', 'K', takeChain(st, ['K', 'PK'], sused), sused, cards),
    slotFrom('P', 'P', takeChain(st, ['P'], sused), sused, cards),
  ];
  const any = rows[0];
  const realFront = front !== 'UNKNOWN' ? front : pools.DL.length >= 3 ? '3-4' : pools.DL.length ? '4-3' : 'UNKNOWN';
  return {
    depthWeek: any?.week ?? null, depthSeason: any?.season ?? null, depthSource: any?.source ?? null,
    snapshotAt: any?.snapshot_at ? new Date(any.snapshot_at).toISOString() : null,
    offense, defense, front: realFront, specialists, nickel,
  };
}

export async function getLineups(gameId: string): Promise<LineupsResponse | null> {
  const g = await one<any>(
    `SELECT id, external_id, season, week, status, away_team_id, home_team_id, kickoff FROM games WHERE external_id = $1`, [gameId]);
  if (!g) return null;
  const teamIds = [g.away_team_id, g.home_team_id];
  // Latest depth chart published at/before this game week for each team (one query).
  const weeks = await q<{ team_id: number; season: number; week: number }>(
    `SELECT DISTINCT ON (team_id) team_id, season, week FROM depth_charts
      WHERE team_id = ANY($1) AND (season < $2 OR (season = $2 AND week <= $3))
      ORDER BY team_id, season DESC, week DESC`, [teamIds, g.season, g.week]);
  const rows = weeks.length
    ? await q<DepthRow>(
        `SELECT d.player_id, d.team_id, d.season, d.week, d.position, d.position_group, d.formation, d.slot, d.depth, d.source, d.snapshot_at
           FROM depth_charts d
           JOIN UNNEST($1::int[], $2::int[], $3::int[]) AS k(team_id, season, week)
             ON d.team_id = k.team_id AND d.season = k.season AND d.week = k.week
          WHERE d.depth <= 3`,
        [weeks.map((w) => w.team_id), weeks.map((w) => w.season), weeks.map((w) => w.week)])
    : [];
  const completed = g.status === 'final';
  const cards = await buildCards(
    rows.map((r) => ({ playerId: r.player_id, teamId: r.team_id, position: r.position, depth: r.depth })),
    { season: g.season, week: g.week, gameDbId: g.id, completed },
  );
  const { byId } = await teamMaps();
  const side = (tid: number): TeamLineup => ({ team: byId.get(tid)!, ...buildTeam(rows.filter((r) => r.team_id === tid), cards) });
  const past = completed || (g.kickoff && new Date(g.kickoff) < new Date());
  return {
    gameId,
    label: past ? 'DEPTH CHART (ARCHIVED)' : 'PROJECTED STARTERS',
    note: past
      ? 'Lineups reflect the team depth chart published before this game (nflverse). Snap shares from the game are shown where available. Depth-chart starters are not official starting lineups.'
      : 'Projected from the most recent team depth chart published on nflverse. These are not confirmed starting lineups; official inactives are released ~90 minutes before kickoff.',
    away: side(g.away_team_id),
    home: side(g.home_team_id),
  };
}
