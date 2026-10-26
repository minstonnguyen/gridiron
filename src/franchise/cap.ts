import type { Contract, ContractYear, FranchiseState, Player } from './types';
import { addDays, parseDate } from './calendar';

/**
 * Salary-cap engine (realistic but simplified, per the Franchise Mode spec).
 *
 * Implements: per-year cap numbers from real OverTheCap contract structures, signing-bonus proration
 * (max 5 years), void years, guaranteed salary, in-season weekly salary (Paragraph 5 paid over 18 weeks),
 * release accounting with pre-/post-June 1 acceleration, CBA minimum salaries, practice-squad pay,
 * franchise / transition tag amounts.
 * Not modelled (stated in the UI): rollover from prior seasons, existing dead money from releases that
 * happened before the save began (not in public nflverse data), incentives (LTBE/NLTBE), offsets.
 */

/** League year L runs from its official start (March 11 in 2027) to the day before the next one. */
// Official league-year start dates published by the NFL (https://www.nfl.com/news/2026-27-national-football-league-important-dates).
const OFFICIAL_LEAGUE_YEAR_START: Record<number, string> = { 2026: '2026-03-11', 2027: '2027-03-11' };
export function leagueYearStart(year: number): string {
  if (OFFICIAL_LEAGUE_YEAR_START[year]) return OFFICIAL_LEAGUE_YEAR_START[year];
  // Fallback for unpublished years: the league year customarily opens on the second Wednesday of March.
  const d = new Date(Date.UTC(year, 2, 1));
  const firstWed = 1 + ((3 - d.getUTCDay() + 7) % 7);
  return `${year}-03-${String(firstWed + 7).padStart(2, '0')}`;
}
export function leagueYear(date: string): number {
  const y = parseDate(date).getUTCFullYear();
  return date >= leagueYearStart(y) ? y : y - 1;
}
/** June 1 of the league year — releases after this date push future proration to next year. */
export function isPostJune1(date: string): boolean {
  const ly = leagueYear(date);
  return date >= `${ly}-06-01`;
}

export function yearOf(c: Contract | null, year: number): ContractYear | null {
  return c?.years.find((y) => y.year === year) ?? null;
}

export function capHit(p: Player, year: number): number {
  return yearOf(p.contract, year)?.cap ?? 0;
}

/** Share of the regular-season salary still unpaid on `date` (weeks remaining / 18). */
export function unpaidShare(state: FranchiseState, date: string): number {
  const reg = state.games.filter((g) => g.type === 'REG' && g.week <= 18);
  const weeks = new Set<number>();
  for (const g of reg) if (g.date >= date) weeks.add(g.week);
  const total = new Set(reg.map((g) => g.week)).size || 18;
  if (state.phase !== 'regular' && !weeks.size) return 0;
  return Math.min(1, weeks.size / total);
}

export const COUNTED_LISTS = new Set(['active', 'ps', 'ps_intl', 'ps_inj', 'ir', 'ir_return', 'pup', 'nfi']);

export function teamCap(state: FranchiseState, team: string, year = leagueYear(state.date)) {
  let players = 0, ps = 0, reserve = 0;
  for (const p of Object.values(state.players)) {
    if (p.team !== team || !COUNTED_LISTS.has(p.list)) continue;
    const h = capHit(p, year);
    if (p.list.startsWith('ps')) ps += h; else if (p.list === 'active') players += h; else reserve += h;
  }
  const dead = state.dead.filter((d) => d.team === team && d.year === year).reduce((s, d) => s + d.amount, 0);
  const used = players + ps + reserve + dead;
  return { year, cap: state.cap, active: players, ps, reserve, dead, used, space: state.cap - used };
}

export function futureCommitments(state: FranchiseState, team: string, years: number[]) {
  return years.map((y) => {
    let total = 0, n = 0;
    for (const p of Object.values(state.players)) {
      if (p.team !== team || !COUNTED_LISTS.has(p.list)) continue;
      const cy = yearOf(p.contract, y);
      if (cy && cy.cap > 0) { total += cy.cap; if (!cy.void) n++; }
    }
    const dead = state.dead.filter((d) => d.team === team && d.year === y).reduce((s, d) => s + d.amount, 0);
    return { year: y, committed: total + dead, players: n, dead };
  });
}

export interface ReleaseImpact {
  year: number; capHitBefore: number; deadThisYear: number; deadNextYear: number; savingsThisYear: number; postJune1: boolean; guaranteedOwed: number;
}

export function releaseImpact(state: FranchiseState, p: Player, date = state.date, june1Designation = false): ReleaseImpact {
  const year = leagueYear(date);
  const c = p.contract;
  const cur = yearOf(c, year);
  const f = unpaidShare(state, date);
  const base = cur?.base ?? 0;
  const gtdRemaining = Math.min(base, cur?.guaranteed ?? 0) * f;
  const unpaidBase = base * f;
  const capHitBefore = cur?.cap ?? 0;
  // the current year's charge keeps everything already earned plus guaranteed money still owed
  const keepThisYear = capHitBefore - unpaidBase + gtdRemaining;
  let futureProration = 0, futureGtd = 0;
  for (const y of c?.years ?? []) {
    if (y.year <= year) continue;
    futureProration += y.prorated;
    futureGtd += Math.min(y.base, y.guaranteed);
  }
  const post = isPostJune1(date) || june1Designation;
  const deadThisYear = keepThisYear + (post ? 0 : futureProration + futureGtd);
  const deadNextYear = post ? futureProration + futureGtd : 0;
  return {
    year, capHitBefore, deadThisYear: r3(deadThisYear), deadNextYear: r3(deadNextYear), savingsThisYear: r3(capHitBefore - deadThisYear),
    postJune1: post, guaranteedOwed: r3(gtdRemaining + futureGtd),
  };
}

/** Apply a release to the books: contract voided, remaining charges become dead money on the releasing team. */
export function applyRelease(state: FranchiseState, p: Player, reason = 'Released') {
  if (!p.team) return;
  const imp = releaseImpact(state, p);
  const team = p.team;
  if (imp.deadThisYear > 0.0005) state.dead.push({ player: p.id, name: p.name, team, year: imp.year, amount: imp.deadThisYear, reason });
  if (imp.deadNextYear > 0.0005) state.dead.push({ player: p.id, name: p.name, team, year: imp.year + 1, amount: imp.deadNextYear, reason });
  p.contract = null;
}

export function minSalary(state: FranchiseState, exp: number): number {
  const t = state.league.min_salary;
  return t[Math.max(0, Math.min(t.length - 1, exp))];
}

export function psSalary(state: FranchiseState, p: Player): number {
  const w = state.league.ps_weekly;
  return (p.exp >= 4 && !p.psExempt ? w.vet_min : w.standard) * 18 / 1e6;
}

/**
 * Build a new contract signed on `date`. Salary for the current season is earned weekly, so a mid-season
 * signing only carries the unpaid share of year-one base salary. Signing bonus prorates over up to 5 years.
 */
export function makeContract(state: FranchiseState, opts: { years: number; apy: number; bonus?: number; guaranteedYears?: number; type: string; date?: string }): Contract {
  const date = opts.date ?? state.date;
  const start = leagueYear(date);
  const share = state.phase === 'regular' || state.phase === 'playoffs' ? unpaidShare(state, date) : 1;
  const bonus = opts.bonus ?? 0;
  const proYears = Math.min(5, opts.years);
  const pr = bonus / proYears;
  const years: ContractYear[] = [];
  for (let i = 0; i < opts.years; i++) {
    const y = start + i;
    const fullBase = Math.max(0, opts.apy - bonus / opts.years);
    const base = i === 0 ? fullBase * share : fullBase;
    const prorated = i < proYears ? pr : 0;
    const g = i < (opts.guaranteedYears ?? 0) ? base : 0;
    years.push({ year: y, base: r3(base), prorated: r3(prorated), roster: 0, option: 0, guaranteed: r3(g), cap: r3(base + prorated), other: 0, void: false });
  }
  return {
    src: 'save', signed: start, years_total: opts.years, value: r3(opts.apy * opts.years), apy: r3(opts.apy),
    guaranteed_total: r3(bonus + years.reduce((s, y) => s + y.guaranteed, 0)), type: opts.type, team: null, expires: start + opts.years - 1, years,
  };
}

export const tagKey = (group: string) =>
  ({ QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', IOL: 'OL', EDGE: 'DE', IDL: 'DT', LB: 'LB', CB: 'CB', S: 'S', K: 'KP', P: 'KP', LS: 'KP' } as Record<string, string>)[group];

export const money = (m: number | null | undefined, digits = 2) =>
  m == null ? '—' : Math.abs(m) >= 1 ? `$${m.toFixed(digits)}M` : `$${Math.round(m * 1000)}K`;

const r3 = (x: number) => Math.round(x * 10000) / 10000;

export { addDays };
