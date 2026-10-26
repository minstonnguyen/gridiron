import type { FranchiseState, Player, PosGroup } from './types';
import { applyRelease, leagueYear, makeContract, minSalary, psSalary, unpaidShare, teamCap, yearOf } from './cap';
import { keyDates, addDays } from './calendar';
import { standings } from './standings';
import { STARTERS } from './attributes';

/**
 * NFL roster rules (2026 season):
 *  - 53-man active/inactive list; 48 may dress on game day (the rest are declared inactive)
 *  - 16-man practice squad (+1 International Player Pathway exemption); max 6 veterans with unlimited accrued seasons,
 *    the rest must have ≤2 accrued seasons
 *  - 2 practice-squad elevations per team per game, 3 per player per season
 *  - Injured reserve: minimum 4 games; 8 return designations per club per season
 *  - Waivers: non-vested players (<4 accrued seasons) released from the 53 are subject to waivers all season; vested
 *    veterans are free to sign anywhere until the day after the trade deadline, then subject to waivers
 *  Sources: https://www.nfl.com/news/2026-27-national-football-league-important-dates ,
 *           https://operations.nfl.com/calendar-events/nfl-free-agency/types-of-free-agents
 */
export const LIMITS = { active: 53, ps: 16, psVets: 6, elevPerGame: 2, elevPerPlayer: 3, irReturns: 8, irMinGames: 4, gameday: 48 };
export const MIN_BY_GROUP: Record<PosGroup, number> = { QB: 2, RB: 3, WR: 5, TE: 3, OT: 4, IOL: 5, EDGE: 4, IDL: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1 };

export type Result = { ok: true; message?: string } | { ok: false; error: string };

export const teamPlayers = (s: FranchiseState, team: string) => Object.values(s.players).filter((p) => p.team === team);
/** 'Veteran' for PS limits: 3+ accrued seasons (nflverse experience counts the current season). */
export const isPsVet = (p: Player) => p.exp >= 4 && !p.psExempt;
export const isPS = (p: Player) => p.list === 'ps' || p.list === 'ps_inj' || p.list === 'ps_intl';

export function counts(s: FranchiseState, team: string) {
  const ps = teamPlayers(s, team);
  const c = { active: 0, ps: 0, psVets: 0, psIntl: 0, ir: 0, other: 0, elevated: 0 };
  for (const p of ps) {
    if (p.list === 'active') c.active++;
    else if (p.list === 'ps_intl') c.psIntl++;
    else if (p.list === 'ps_inj') c.other++; // PS/injured players do not count toward the 16
    else if (isPS(p)) { c.ps++; if (isPsVet(p)) c.psVets++; }
    else if (p.list === 'ir' || p.list === 'ir_return') c.ir++;
    else c.other++;
    if (p.elevated) c.elevated++;
  }
  return c;
}

export function violations(s: FranchiseState, team: string): string[] {
  const c = counts(s, team);
  const out: string[] = [];
  if (c.active > LIMITS.active) out.push(`Active roster has ${c.active} players (limit ${LIMITS.active}). Release or move ${c.active - LIMITS.active}.`);
  if (c.ps > LIMITS.ps) out.push(`Practice squad has ${c.ps} players (limit ${LIMITS.ps}, plus one International Pathway exemption).`);
  if (c.psVets > LIMITS.psVets) out.push(`Practice squad has ${c.psVets} veterans with 3+ accrued seasons (limit ${LIMITS.psVets}).`);
  const healthyQB = teamPlayers(s, team).filter((p) => p.list === 'active' && p.group === 'QB' && !p.injury).length;
  if (healthyQB < 1) out.push('No healthy quarterback on the active roster.');
  for (const [g, label] of [['K', 'kicker'], ['P', 'punter'], ['LS', 'long snapper']] as const) {
    const n = teamPlayers(s, team).filter((p) => (p.list === 'active' || p.elevated) && p.group === g && !p.injury).length;
    if (n < 1) out.push(`No healthy ${label} available for game day. Sign or elevate one.`);
  }
  const cap = teamCap(s, team);
  if (cap.space < 0) out.push(`Over the salary cap by $${(-cap.space).toFixed(2)}M. Clubs must be cap-compliant at all times.`);
  return out;
}

function log(s: FranchiseState, team: string, text: string, p?: Player) {
  s.transactions.unshift({ date: s.date, team, text });
  if (p) p.history.unshift({ date: s.date, text });
}

export function waiversApply(s: FranchiseState, p: Player): boolean {
  if (isPS(p)) return false; // practice-squad players are not subject to waivers
  const kd = keyDates(s.games);
  if (s.phase === 'season_over') return !p.vet;
  return !p.vet || s.date >= kd.vestedWaivers;
}

export function release(s: FranchiseState, id: string, by = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== by) return { ok: false, error: 'Player is not on this roster.' };
  const team = p.team;
  const contractCopy = p.contract ? JSON.parse(JSON.stringify(p.contract)) : null;
  const toWaivers = waiversApply(s, p);
  applyRelease(s, p, isPS(p) ? 'Released from practice squad' : 'Released');
  p.lastTeam = team; p.lastSeason = s.season; p.team = null; p.elevated = false; p.injury = p.injury && p.injury.gamesOut > 0 ? p.injury : null;
  if (toWaivers) {
    p.list = 'waivers';
    p.waiver = { from: team, until: addDays(s.date, 1), claims: [] };
    (p as any)._waiverContract = contractCopy;
    log(s, team, `Waived ${p.pos} ${p.name}`, p);
  } else {
    p.list = 'fa'; p.waiver = null; p.ask = null;
    log(s, team, `Released ${p.pos} ${p.name}${p.vet ? ' (vested veteran — free agent immediately)' : ''}`, p);
  }
  const d = s.depth[team]?.[p.group];
  if (d) s.depth[team][p.group] = d.filter((x) => x !== id);
  return { ok: true };
}

export function claim(s: FranchiseState, id: string, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.list !== 'waivers' || !p.waiver) return { ok: false, error: 'Player is not on waivers.' };
  if (p.waiver.from === team) return { ok: false, error: 'You cannot claim a player you waived.' };
  if (!p.waiver.claims.includes(team)) p.waiver.claims.push(team);
  if (team === s.userTeam) log(s, team, `Submitted waiver claim on ${p.pos} ${p.name}`);
  return { ok: true, message: 'Claim submitted. Waivers process at 4:00 p.m. ET tomorrow.' };
}

/** Waiver priority: worst record first (win %, then strength of schedule), per NFL procedure during the season. */
export function waiverOrder(s: FranchiseState): string[] {
  const rows = standings(s);
  return [...s.teams.map((t) => t.abbr)].sort((a, b) => (rows[a].pct - rows[b].pct) || (rows[a].sos - rows[b].sos));
}

export function processWaivers(s: FranchiseState, onAward: (p: Player, team: string | null) => void) {
  const order = waiverOrder(s);
  for (const p of Object.values(s.players)) {
    if (p.list !== 'waivers' || !p.waiver || p.waiver.until > s.date) continue;
    const winner = order.find((t) => p.waiver!.claims.includes(t)) ?? null;
    const prevTeam = p.waiver.from;
    if (winner) {
      // claiming club assumes the remaining salary; the signing-bonus proration stays with the waiving club
      const c = (p as any)._waiverContract;
      if (c) {
        const ly = leagueYear(s.date);
        const share = unpaidShare(s, s.date);
        // waiving club keeps what was already earned plus all signing-bonus proration; claimer assumes unpaid salary
        s.dead = s.dead.filter((d) => !(d.player === p.id && d.team === prevTeam));
        const cur = c.years.find((y: any) => y.year === ly);
        const keepNow = (cur ? cur.prorated + cur.base * (1 - share) + (cur.roster ?? 0) + (cur.option ?? 0) : 0);
        const future = c.years.filter((y: any) => y.year > ly).reduce((t: number, y: any) => t + y.prorated, 0);
        if (keepNow > 0.0005) s.dead.push({ player: p.id, name: p.name, team: prevTeam, year: ly, amount: keepNow, reason: 'Waived (claimed)' });
        if (future > 0.0005) s.dead.push({ player: p.id, name: p.name, team: prevTeam, year: ly + 1, amount: future, reason: 'Waived (claimed)' });
        for (const y of c.years) { y.prorated = 0; y.roster = 0; y.option = 0; y.cap = y.base + (y.other ?? 0); }
        if (cur) { cur.base = cur.base * share; cur.guaranteed = Math.min(cur.guaranteed, cur.base); cur.cap = cur.base; }
        c.years = c.years.filter((y: any) => !y.void);
        c.src = 'save'; c.type = 'Waiver claim (assumed contract)';
      }
      p.contract = c ?? makeContract(s, { years: 1, apy: minSalary(s, p.exp), type: 'Waiver claim' });
      p.team = winner; p.list = 'active'; p.waiver = null;
      log(s, winner, `Claimed ${p.pos} ${p.name} off waivers from ${prevTeam}`, p);
      s.depth[winner][p.group] = [...(s.depth[winner][p.group] ?? []), p.id];
    } else {
      p.list = 'fa'; p.waiver = null; p.ask = null;
      log(s, prevTeam, `${p.pos} ${p.name} cleared waivers and is a free agent`, p);
    }
    delete (p as any)._waiverContract;
    onAward(p, winner);
  }
}

export function psEligible(p: Player) { return isPsVet(p) ? 'veteran' : 'standard'; }

export function canAddPS(s: FranchiseState, team: string, p: Player): Result {
  const c = counts(s, team);
  if (c.ps >= LIMITS.ps) return { ok: false, error: `Practice squad is full (${LIMITS.ps}).` };
  if (p.exp >= 4 && c.psVets >= LIMITS.psVets) return { ok: false, error: `Practice squad already has ${LIMITS.psVets} veterans.` };
  return { ok: true };
}

export function freeAgentAsk(s: FranchiseState, p: Player): number {
  if (p.ask != null) return p.ask;
  const min = minSalary(s, p.exp);
  const premium = p.ca > 60 ? (p.ca - 60) ** 2 * 0.011 : 0;
  const ambition = (p.personality.ambition ?? 10) / 10;
  p.ask = Math.round((min + premium * (0.85 + 0.15 * ambition)) * 1000) / 1000;
  return p.ask;
}

export function signFA(s: FranchiseState, id: string, opts: { list: 'active' | 'ps'; apy?: number; years?: number }, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.list !== 'fa') return { ok: false, error: 'Player is not a free agent.' };
  if (s.phase === 'season_over') return { ok: false, error: 'Free agency for the next league year opens in Phase 2 of Franchise Mode.' };
  const c = counts(s, team);
  if (opts.list === 'active' && c.active >= LIMITS.active) return { ok: false, error: 'Active roster is full (53). Release or move a player first.' };
  if (opts.list === 'ps') { const ok = canAddPS(s, team, p); if (!ok.ok) return ok; }
  const years = opts.years ?? 1;
  const apy = opts.list === 'ps' ? Math.max(opts.apy ?? 0, psSalary(s, p)) : opts.apy ?? freeAgentAsk(s, p);
  if (opts.list === 'active') {
    const ask = freeAgentAsk(s, p);
    if (apy + 1e-6 < ask) return { ok: false, error: `${p.name} wants at least $${ask.toFixed(3)}M per season.` };
  }
  const contract = makeContract(s, { years, apy, type: opts.list === 'ps' ? 'Practice squad' : years === 1 ? 'Veteran / street free agent (1 yr)' : 'Free agent' });
  const ly = leagueYear(s.date);
  const capNow = yearOf(contract, ly)?.cap ?? 0;
  if (teamCap(s, team).space < capNow) return { ok: false, error: `Not enough cap space ($${capNow.toFixed(3)}M needed this season).` };
  p.contract = contract; p.team = team; p.list = opts.list; p.ask = null; p.injury = null;
  if (team === s.userTeam) s.knowledge[p.id] = Math.max(s.knowledge[p.id] ?? 30, 60);
  log(s, team, `Signed ${p.pos} ${p.name} to the ${opts.list === 'ps' ? 'practice squad' : 'active roster'} (${years} yr, $${apy.toFixed(3)}M APY)`, p);
  const d = (s.depth[team] ??= {} as any);
  d[p.group] = [...(d[p.group] ?? []), p.id];
  return { ok: true };
}

export function promote(s: FranchiseState, id: string, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== team || !isPS(p)) return { ok: false, error: 'Player is not on your practice squad.' };
  if (counts(s, team).active >= LIMITS.active) return { ok: false, error: 'Active roster is full (53).' };
  const apy = Math.max(minSalary(s, p.exp), p.contract?.apy ?? 0);
  const contract = makeContract(s, { years: 1, apy, type: 'Signed from practice squad' });
  const ly = leagueYear(s.date);
  const old = yearOf(p.contract, ly)?.cap ?? 0;
  const capNow = yearOf(contract, ly)?.cap ?? 0;
  if (teamCap(s, team).space + old < capNow) return { ok: false, error: 'Not enough cap space.' };
  // PS pay earned so far stays on the books
  const earned = old * (1 - unpaidShare(s, s.date));
  if (earned > 0) { const cy = yearOf(contract, ly); if (cy) { cy.cap += earned; cy.base += earned; } }
  p.contract = contract; p.list = 'active'; p.elevated = false;
  log(s, team, `Signed ${p.pos} ${p.name} from the practice squad to the active roster`, p);
  return { ok: true };
}

export function elevate(s: FranchiseState, id: string, on: boolean, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== team || !isPS(p)) return { ok: false, error: 'Only practice-squad players can be elevated.' };
  if (!on) { p.elevated = false; return { ok: true }; }
  if (p.injury) return { ok: false, error: `${p.name} is injured.` };
  if (counts(s, team).elevated >= LIMITS.elevPerGame) return { ok: false, error: 'Two practice-squad elevations per game maximum.' };
  if (p.elevations >= LIMITS.elevPerPlayer) return { ok: false, error: `${p.name} has used all 3 elevations this season — sign him to the 53 to play him again.` };
  p.elevated = true;
  log(s, team, `Elevated ${p.pos} ${p.name} from the practice squad for the next game`, p);
  return { ok: true };
}

export function placeIR(s: FranchiseState, id: string, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== team || p.list !== 'active') return { ok: false, error: 'Player must be on the active roster.' };
  if (!p.injury) return { ok: false, error: 'Only injured players can be placed on injured reserve.' };
  p.list = 'ir'; p.irGames = 0;
  log(s, team, `Placed ${p.pos} ${p.name} on injured reserve (${p.injury.type})`, p);
  return { ok: true };
}

export function activateIR(s: FranchiseState, id: string, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== team || !['ir', 'ir_return', 'pup', 'nfi'].includes(p.list)) return { ok: false, error: 'Player is not on a reserve list.' };
  if (p.injury) return { ok: false, error: `${p.name} is still injured (${p.injury.gamesOut} more game${p.injury.gamesOut === 1 ? '' : 's'}).` };
  if ((p.list === 'ir' || p.list === 'ir_return') && p.irGames < LIMITS.irMinGames) return { ok: false, error: `Players must miss at least ${LIMITS.irMinGames} games on IR (${p.irGames} so far).` };
  const used = s.irReturns[team] ?? 0;
  if ((p.list === 'ir' || p.list === 'ir_return') && used >= LIMITS.irReturns) return { ok: false, error: 'All 8 IR return designations have been used this season.' };
  if (counts(s, team).active >= LIMITS.active) return { ok: false, error: 'Active roster is full (53). Make room first.' };
  if (p.list === 'ir' || p.list === 'ir_return') s.irReturns[team] = used + 1;
  p.list = 'active';
  log(s, team, `Activated ${p.pos} ${p.name} to the active roster`, p);
  return { ok: true };
}

export function movePS(s: FranchiseState, id: string, team = s.userTeam): Result {
  const p = s.players[id];
  if (!p || p.team !== team || p.list !== 'active') return { ok: false, error: 'Player must be on the active roster.' };
  // moving a 53-man player to the PS requires releasing him; non-vested players must clear waivers first
  if (waiversApply(s, p)) return { ok: false, error: `${p.name} would have to clear waivers first. Release him, then re-sign him to the practice squad if he clears.` };
  const ok = canAddPS(s, team, p); if (!ok.ok) return ok;
  release(s, id, team);
  return signFA(s, id, { list: 'ps' }, team);
}

/** Auto depth: healthy players first, ordered by your staff's view (CA for AI teams). */
export function autoDepth(s: FranchiseState, team: string) {
  const ps = teamPlayers(s, team).filter((p) => p.list === 'active' || isPS(p));
  const by: Record<string, string[]> = {};
  for (const g of Object.keys(STARTERS)) {
    by[g] = ps.filter((p) => p.group === g).sort((a, b) => Number(!!a.injury) - Number(!!b.injury) || Number(isPS(a)) - Number(isPS(b)) || b.ca - a.ca).map((p) => p.id);
  }
  s.depth[team] = by as any;
}

export function syncDepth(s: FranchiseState, team: string) {
  const d = (s.depth[team] ??= {} as any);
  const present = new Set(teamPlayers(s, team).filter((p) => p.list === 'active' || isPS(p)).map((p) => p.id));
  for (const g of Object.keys(STARTERS)) {
    const cur = (d[g] ?? []).filter((id: string) => present.has(id) && s.players[id].group === g);
    for (const id of present) if (s.players[id].group === g && !cur.includes(id)) cur.push(id);
    d[g] = cur;
  }
}
