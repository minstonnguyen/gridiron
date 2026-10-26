import type { FranchiseState, Game } from './types';
import { hashUnit } from './rng';

export interface Row {
  team: string; conf: string; div: string; w: number; l: number; t: number; pf: number; pa: number;
  divW: number; divL: number; divT: number; confW: number; confL: number; confT: number; pct: number; divPct: number; confPct: number;
  streak: string; sov: number; sos: number;
}

const pct = (w: number, l: number, t: number) => (w + l + t ? (w + t / 2) / (w + l + t) : 0);

export function standings(state: FranchiseState): Record<string, Row> {
  const tm = Object.fromEntries(state.teams.map((t) => [t.abbr, t]));
  const rows: Record<string, Row> = {};
  for (const t of state.teams) rows[t.abbr] = { team: t.abbr, conf: t.conf, div: t.div, w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, pct: 0, divPct: 0, confPct: 0, streak: '', sov: 0, sos: 0 };
  const reg = state.games.filter((g) => g.type === 'REG' && g.result).sort((a, b) => a.date.localeCompare(b.date));
  const beat: Record<string, string[]> = {}, played: Record<string, string[]> = {};
  const streaks: Record<string, string[]> = {};
  for (const g of reg) {
    const r = g.result!;
    for (const [me, op, mine, theirs] of [[g.home, g.away, r.home, r.away], [g.away, g.home, r.away, r.home]] as [string, string, number, number][]) {
      const row = rows[me];
      row.pf += mine; row.pa += theirs;
      const res = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
      if (res === 'W') { row.w++; (beat[me] ??= []).push(op); } else if (res === 'L') row.l++; else row.t++;
      (played[me] ??= []).push(op);
      (streaks[me] ??= []).push(res);
      const sameDiv = tm[me].div === tm[op].div, sameConf = tm[me].conf === tm[op].conf;
      if (sameDiv) { if (res === 'W') row.divW++; else if (res === 'L') row.divL++; else row.divT++; }
      if (sameConf) { if (res === 'W') row.confW++; else if (res === 'L') row.confL++; else row.confT++; }
    }
  }
  for (const r of Object.values(rows)) {
    r.pct = pct(r.w, r.l, r.t); r.divPct = pct(r.divW, r.divL, r.divT); r.confPct = pct(r.confW, r.confL, r.confT);
    const s = streaks[r.team] ?? [];
    if (s.length) { const last = s[s.length - 1]; let n = 0; for (let i = s.length - 1; i >= 0 && s[i] === last; i--) n++; r.streak = `${last}${n}`; }
  }
  for (const r of Object.values(rows)) {
    const b = beat[r.team] ?? [], p = played[r.team] ?? [];
    r.sov = b.length ? b.reduce((s, t) => s + rows[t].pct, 0) / b.length : 0;
    r.sos = p.length ? p.reduce((s, t) => s + rows[t].pct, 0) / p.length : 0;
  }
  return rows;
}

function h2h(state: FranchiseState, a: string, b: string) {
  let w = 0, l = 0;
  for (const g of state.games) {
    if (g.type !== 'REG' || !g.result) continue;
    if (g.home === a && g.away === b) { if (g.result.home > g.result.away) w++; else if (g.result.home < g.result.away) l++; }
    if (g.away === a && g.home === b) { if (g.result.away > g.result.home) w++; else if (g.result.away < g.result.home) l++; }
  }
  return w - l;
}

/**
 * Simplified NFL tiebreakers: win % → head-to-head (two-team ties) → division record (division ties) →
 * conference record → strength of victory → strength of schedule → point differential → deterministic coin toss.
 * Common-games and net-touchdown steps are not modelled (noted on the standings page).
 */
export function rank(state: FranchiseState, teams: string[], rows: Record<string, Row>, division: boolean): string[] {
  const coin = (t: string) => hashUnit(`${state.meta.id}:${state.season}:${t}`);
  return [...teams].sort((a, b) => {
    const A = rows[a], B = rows[b];
    if (A.pct !== B.pct) return B.pct - A.pct;
    const tied = teams.filter((t) => rows[t].pct === A.pct);
    if (tied.length === 2) { const h = h2h(state, a, b); if (h) return -h; }
    if (division && A.divPct !== B.divPct) return B.divPct - A.divPct;
    if (A.confPct !== B.confPct) return B.confPct - A.confPct;
    if (A.sov !== B.sov) return B.sov - A.sov;
    if (A.sos !== B.sos) return B.sos - A.sos;
    const pd = (B.pf - B.pa) - (A.pf - A.pa);
    if (pd) return pd;
    return coin(b) - coin(a);
  });
}

export function divisions(state: FranchiseState) {
  const out: Record<string, string[]> = {};
  for (const t of state.teams) (out[t.div] ??= []).push(t.abbr);
  return out;
}

/** Seven seeds per conference: four division winners (1–4) then three wild cards (5–7). */
export function seeds(state: FranchiseState): Record<'AFC' | 'NFC', string[]> {
  const rows = standings(state);
  const divs = divisions(state);
  const out = { AFC: [] as string[], NFC: [] as string[] };
  for (const conf of ['AFC', 'NFC'] as const) {
    const winners: string[] = [];
    const rest: string[] = [];
    for (const [d, teams] of Object.entries(divs)) {
      if (!d.startsWith(conf)) continue;
      const r = rank(state, teams, rows, true);
      winners.push(r[0]); rest.push(...r.slice(1));
    }
    out[conf] = [...rank(state, winners, rows, false), ...rank(state, rest, rows, false).slice(0, 3)];
  }
  return out;
}

export function teamRecord(rows: Record<string, Row>, t: string) {
  const r = rows[t];
  return r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '0-0';
}

export function userGames(state: FranchiseState): Game[] {
  return state.games.filter((g) => g.home === state.userTeam || g.away === state.userTeam).sort((a, b) => a.date.localeCompare(b.date));
}
