import type { Calibration, FranchiseState, Game, Message, Player, PosGroup, Seed } from './types';
import { Rng } from './rng';
import { buildPlayer, STARTERS, ageOn } from './attributes';
import { keyDates, addDays, longDate, shortDate } from './calendar';
import { generateStaff } from './staff';
import { lineup, rollInjury, simulateScore, strengthTable, teamIndex } from './sim';
import { seeds, standings, teamRecord } from './standings';
import {
  LIMITS, MIN_BY_GROUP, activateIR, isPsVet, autoDepth, counts, isPS, placeIR, processWaivers, promote, release, signFA, syncDepth, teamPlayers, violations, claim,
} from './roster';
import { psSalary, teamCap } from './cap';

export const SAVE_VERSION = 1;

export interface NewGameOptions { team: string; coach: string; name: string; ironman: boolean; assistantRoster: boolean }

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

export function pickValueFn(cal: Calibration) {
  const rv: Record<string, number> = cal.pickValue?.relative_value ?? {};
  return (pick: number) => rv[String(Math.min(256, Math.max(1, pick)))] ?? 0.1;
}

export function newGame(seed: Seed, cal: Calibration, opts: NewGameOptions): FranchiseState {
  const id = uid();
  const rng = Rng.fromSeed(`${id}:${seed.generated_at}`);
  const season = seed.season;
  const date = seed.start_date;

  // market valuation: APY percentile within position group (real OverTheCap contracts only)
  const apyPctById = new Map<string, number>();
  const byGroup: Record<string, { id: string; apy: number }[]> = {};
  for (const p of seed.players) if (p.contract?.src === 'otc' && p.contract.apy != null) (byGroup[p.group] ??= []).push({ id: p.id, apy: p.contract.apy });
  for (const xs of Object.values(byGroup)) {
    xs.sort((a, b) => a.apy - b.apy);
    xs.forEach((x, i) => apyPctById.set(x.id, (100 * i) / Math.max(1, xs.length - 1)));
  }
  // real depth-chart rank within team × group
  const depthRankById = new Map<string, number>();
  const tg: Record<string, { id: string; d: number }[]> = {};
  for (const p of seed.players) {
    if (!p.team || !p.depth?.length) continue;
    const d = Math.min(...p.depth.map((x) => x.depth ?? 9));
    (tg[`${p.team}:${p.group}`] ??= []).push({ id: p.id, d });
  }
  for (const xs of Object.values(tg)) { xs.sort((a, b) => a.d - b.d); xs.forEach((x, i) => depthRankById.set(x.id, i + 1)); }

  const ctx = { season, date, rng, cal, apyPctById, depthRankById, pickValue: pickValueFn(cal) };
  const players: Record<string, Player> = {};
  for (const sp of seed.players) {
    if (players[sp.id]) continue;
    const p = buildPlayer(sp, ctx);
    if (p.team && (p.list === 'ir' || p.list === 'ir_return' || p.list === 'pup' || p.list === 'nfi' || p.list === 'ps_inj')) {
      // real reserve-list placements; the remaining recovery time is not public, so it is simulated
      p.injury = { type: 'Undisclosed (real reserve list)', gamesOut: rng.int(0, 8), since: date, seasonEnding: false };
      p.irGames = p.list === 'ps_inj' ? 0 : rng.int(2, 6);
      if (p.injury.gamesOut === 0) p.injury = null;
    }
    players[p.id] = p;
  }

  // team prior: real point differential per game (last season + this season so far), shrunk toward 0
  const played: Record<string, { pd: number; g: number }> = {};
  for (const g of seed.schedule) {
    if (!g.result) continue;
    for (const [t, d] of [[g.home, g.result.home - g.result.away], [g.away, g.result.away - g.result.home]] as [string, number][]) {
      const x = (played[t] ??= { pd: 0, g: 0 }); x.pd += d; x.g += 1;
    }
  }
  const teams = seed.teams.map((t) => {
    const cur = played[t.abbr] ?? { pd: 0, g: 0 };
    const prev = t.prev_season ?? { games: 0, point_diff: 0 };
    const w = cur.g + 0.5 * prev.games;
    const pdpg = w ? (cur.pd + 0.5 * prev.point_diff) / w : 0;
    const shrink = w / (w + 6);
    return { ...t, prior: (pdpg / 6.5) * shrink };
  });

  const games: Game[] = seed.schedule.map((g) => ({ id: g.id, week: g.week, type: 'REG', date: g.date, home: g.home, away: g.away, neutral: g.neutral, result: g.result }));

  const state: FranchiseState = {
    meta: { id, name: opts.name, team: opts.team, coach: opts.coach, created: new Date().toISOString(), updated: new Date().toISOString(), date, ironman: opts.ironman, seedGenerated: seed.generated_at, version: SAVE_VERSION },
    seed: { generated_at: seed.generated_at, season, roster_week: seed.roster_week, start_date: seed.start_date },
    rng: [], date, season, phase: 'regular', userTeam: opts.team, teams, players, depth: {}, userDepthLocked: false, inactives: {},
    staff: [], games, inbox: [], news: [], dead: [], transactions: [], irReturns: {}, settings: { assistantRoster: opts.assistantRoster },
    knowledge: {}, bias: {}, cap: seed.league.salary_cap, league: seed.league, log: [],
  };
  state.staff = generateStaff(rng, state);

  // real practice squads are legal by definition; extra 3+ season players must qualify under the games exception
  for (const t of seed.teams) {
    const vets = Object.values(state.players).filter((p) => p.team === t.abbr && (p.list === 'ps' || p.list === 'ps_inj') && p.exp >= 4).sort((a, b) => b.exp - a.exp);
    vets.slice(6).forEach((p) => { p.psExempt = true; });
  }
  // initial depth: the real depth chart order first, then CA
  for (const t of teams) {
    const ps = teamPlayers(state, t.abbr).filter((p) => p.list === 'active' || isPS(p));
    const by: Record<string, string[]> = {};
    for (const g of Object.keys(STARTERS)) {
      by[g] = ps.filter((p) => p.group === g).sort((a, b) =>
        Number(!!a.injury) - Number(!!b.injury) || Number(isPS(a)) - Number(isPS(b)) || (a.basis.depthRank ?? 99) - (b.basis.depthRank ?? 99) || b.ca - a.ca).map((p) => p.id);
    }
    state.depth[t.abbr] = by as any;
  }
  // knowledge: your coaches know your roster; the rest of the league is known from public tape
  for (const p of Object.values(players)) {
    state.knowledge[p.id] = p.team === opts.team ? 90 : (p.basis.games ?? 0) >= 6 ? 50 : 30;
  }
  for (const p of Object.values(players)) if (p.list === 'fa') p.ask = null;

  const team = teams.find((t) => t.abbr === opts.team)!;
  const tbl = strengthTable(state);
  const ranked = [...teams].sort((a, b) => teamIndex(state, b.abbr, tbl) - teamIndex(state, a.abbr, tbl)).map((t) => t.abbr);
  const r = ranked.indexOf(opts.team) + 1;
  const expectation = r <= 6 ? 'contend for the Super Bowl' : r <= 14 ? 'reach the playoffs' : r <= 22 ? 'compete for a wild-card place' : 'show clear signs of progress';
  const rows = standings(state);
  const kd = keyDates(games);
  msg(state, {
    from: 'Assistant GM', kind: 'staff', subject: 'Your roster, contracts and what is real',
    body: `Rosters, roster statuses, jersey numbers and depth order are the real NFL lists as of week ${seed.roster_week}. Contracts come from OverTheCap via nflverse (${Object.values(players).filter((p) => p.team && p.contract?.src === 'otc').length} real deals); players without a public deal carry the CBA minimum, marked "est".\n\n` +
      `Results before ${shortDate(date)} are the real scores. From today every game is simulated — the league diverges from reality immediately.\n\n` +
      `Attribute ranges are our staff's estimates. Your own players are well known; for the rest of the league we rely on tape until we face them.`,
  });
  msg(state, {
    from: 'GRIDIRON', kind: 'system', subject: 'Phase 1 build: what is live',
    body: 'Live now: real league seed, cap engine, roster rules (53 / 16 PS / IR / waivers / elevations), injuries calibrated to real data, a provisional results model, standings, playoffs, inbox and saves.\n\n' +
      'Coming next: Phase 2 scouting & the 7-round draft with real 2027 prospects, Phase 3 play-by-play match engine and coaching, Phase 4 free-agency negotiation, trades and AI front offices, Phase 5 morale, media and owner pressure.',
  });
  msg(state, {
    from: 'Ownership', kind: 'owner', subject: `Welcome to the ${team.name}`,
    body: `${opts.coach}, you take over as General Manager and Head Coach of the ${team.name} with the club at ${teamRecord(rows, opts.team)}.\n\n` +
      `Our expectation for the rest of the ${season} season: ${expectation}. Our internal ranking puts the roster ${ordinal(r)} of 32.\n\n` +
      `The trade deadline is ${longDate(kd.tradeDeadline)}. Use Continue to move through the calendar day by day — I expect a clean, cap-compliant 53 every game day.`,
  });
  const c0 = counts(state, opts.team);
  if (c0.active > LIMITS.active || c0.ps > LIMITS.ps) {
    msg(state, {
      from: 'Assistant GM', kind: 'staff', urgent: true, link: '/franchise/squad',
      subject: 'Roster over the limit — action needed',
      body: `The latest official roster list for our club shows ${c0.active} players on the active roster and ${c0.ps} on the practice squad (limits ${LIMITS.active} and ${LIMITS.ps}). The league's weekly list can lag behind transactions. Get us to a legal roster before we continue.`,
    });
  }
  news(state, `${opts.coach} named GM and head coach of the ${team.name}`, opts.team);
  state.rng = rng.state();
  return state;
}

const ordinal = (n: number) => { const t = n % 100, u = n % 10; return `${n}${t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'}`; };

export function msg(state: FranchiseState, m: Omit<Message, 'id' | 'date' | 'read'> & { date?: string }) {
  state.inbox.unshift({ id: Math.random().toString(36).slice(2), date: m.date ?? state.date, read: false, ...m });
  if (state.inbox.length > 400) state.inbox.length = 400;
}
export function news(state: FranchiseState, headline: string, team?: string, body?: string) {
  state.news.unshift({ id: Math.random().toString(36).slice(2), date: state.date, headline, team, body });
  if (state.news.length > 400) state.news.length = 400;
}

export function gamesOn(state: FranchiseState, date: string) { return state.games.filter((g) => g.date === date && !g.result); }
export function userGameOn(state: FranchiseState, date = state.date) {
  return gamesOn(state, date).find((g) => g.home === state.userTeam || g.away === state.userTeam) ?? null;
}
export function nextUserGame(state: FranchiseState) {
  return state.games.filter((g) => !g.result && (g.home === state.userTeam || g.away === state.userTeam)).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** Problems that stop Continue (FM-style "you must resolve this first"). */
export function blockers(state: FranchiseState): string[] {
  if (state.phase === 'season_over') return ['The season is complete. The offseason (draft, free agency) unlocks in Phase 2.'];
  const g = userGameOn(state);
  if (!g) return violations(state, state.userTeam).filter((v) => v.startsWith('Active roster') || v.startsWith('Practice squad') || v.startsWith('Over the salary cap'));
  return violations(state, state.userTeam);
}

export function advanceDay(state: FranchiseState, cal: Calibration): { played: Game[]; blocked?: string[] } {
  if (state.settings.assistantRoster && state.phase !== 'season_over' && blockers(state).length) {
    // delegated roster: let the assistant GM fix limits before checking blockers
    const r0 = new Rng(state.rng); aiRoster(state, r0, state.userTeam, true); state.rng = r0.state();
  }
  const b = blockers(state);
  if (b.length) return { played: [], blocked: b };
  const rng = new Rng(state.rng);
  const today = state.date;
  const played: Game[] = [];
  const kd = keyDates(state.games);

  // 1) games
  const todays = gamesOn(state, today);
  if (todays.length) {
    for (const t of state.teams) if (t.abbr !== state.userTeam || !state.userDepthLocked) syncDepthFor(state, t.abbr);
    syncDepth(state, state.userTeam);
    const tbl = strengthTable(state);
    for (const g of todays) {
      const ih = teamIndex(state, g.home, tbl), ia = teamIndex(state, g.away, tbl);
      g.result = { ...simulateScore(rng, cal, ih, ia, g.neutral, g.type !== 'REG'), real: false };
      played.push(g);
      for (const team of [g.home, g.away]) afterGame(state, cal, rng, team, g);
      // you learn a lot about players you face
      const opp = g.home === state.userTeam ? g.away : g.away === state.userTeam ? g.home : null;
      if (opp) for (const p of teamPlayers(state, opp)) state.knowledge[p.id] = Math.min(80, (state.knowledge[p.id] ?? 30) + 12);
      if (opp) userResultMessage(state, g);
    }
    const big = played.filter((g) => Math.abs(g.result!.home - g.result!.away) >= 21);
    for (const g of big.slice(0, 1)) {
      const w = g.result!.home > g.result!.away ? g.home : g.away, l = w === g.home ? g.away : g.home;
      news(state, `${teamName(state, w)} rout ${teamName(state, l)} ${Math.max(g.result!.home, g.result!.away)}-${Math.min(g.result!.home, g.result!.away)}`, w);
    }
  }

  // 2) waivers clear at 4pm ET the day after a release
  processWaivers(state, (p, winner) => {
    if (p.waiver === null && winner === state.userTeam) msg(state, { from: 'League Office', kind: 'transaction', subject: `Waiver claim awarded: ${p.name}`, body: `${p.pos} ${p.name} has been awarded to you off waivers.` });
  });

  // 3) AI clubs keep legal, sensible rosters (and yours, if you delegated it)
  for (const t of state.teams) {
    if (t.abbr === state.userTeam && !state.settings.assistantRoster) continue;
    aiRoster(state, rng, t.abbr, t.abbr === state.userTeam);
  }
  aiWaiverClaims(state);

  // 4) calendar events
  if (today === addDays(kd.tradeDeadline, -7)) msg(state, { from: 'Assistant GM', kind: 'staff', subject: 'Trade deadline in one week', body: `All trading ends ${longDate(kd.tradeDeadline)} at 4:00 p.m. ET. (Trades arrive in Phase 4 of Franchise Mode.)` });
  if (today === kd.tradeDeadline) { msg(state, { from: 'League Office', kind: 'league', subject: 'Trade deadline has passed', body: 'All trading for the season ended at 4:00 p.m. ET today.' }); news(state, 'Trade deadline passes'); }
  if (today === kd.vestedWaivers) msg(state, { from: 'League Office', kind: 'league', subject: 'Vested veterans now subject to waivers', body: 'From today, players with four or more accrued seasons released from the 53 must clear waivers for the rest of the season.' });
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 2) weeklyDigest(state);

  // 5) season structure
  const regLeft = state.games.some((g) => g.type === 'REG' && !g.result);
  if (state.phase === 'regular' && !regLeft) startPlayoffs(state, kd);
  else if (state.phase === 'playoffs') progressPlayoffs(state, kd);

  // 6) staff knowledge creeps up for the whole league (basic pro scouting; assignments arrive in Phase 2)
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 3) {
    for (const p of Object.values(state.players)) if (p.team && p.team !== state.userTeam) state.knowledge[p.id] = Math.min(70, (state.knowledge[p.id] ?? 30) + 1);
  }

  if (state.phase !== 'season_over') state.date = addDays(today, 1);
  state.meta.date = state.date; state.meta.updated = new Date().toISOString();
  state.rng = rng.state();
  return { played };
}

function syncDepthFor(state: FranchiseState, team: string) {
  if (team === state.userTeam && state.userDepthLocked) { syncDepth(state, team); return; }
  autoDepth(state, team);
}

function afterGame(state: FranchiseState, cal: Calibration, rng: Rng, team: string, g: Game) {
  const ps = teamPlayers(state, team);
  // recovery: a game passes for everyone already hurt
  for (const p of ps) {
    if (p.list === 'ir' || p.list === 'ir_return' || p.list === 'pup' || p.list === 'nfi') p.irGames++;
    if (p.injury) {
      p.injury.gamesOut = Math.max(0, p.injury.gamesOut - 1);
      if (p.injury.gamesOut === 0 && !p.injury.seasonEnding) {
        const was = p.injury.type;
        p.injury = null;
        if (team === state.userTeam) msg(state, { from: 'Head Athletic Trainer', kind: 'medical', subject: `${p.name} cleared to return`, body: `${p.pos} ${p.name} has recovered from his ${was.toLowerCase()} injury${p.list !== 'active' && !isPS(p) ? ' and can be activated from the reserve list' : ''}.` });
      }
    }
  }
  // new injuries among players who dressed
  const lu = lineup(state, team);
  const remaining = state.games.filter((x) => (x.home === team || x.away === team) && !x.result).length;
  for (const grp of Object.keys(lu) as PosGroup[]) {
    lu[grp].forEach((p, i) => {
      if (p.injury) return;
      const starter = i < STARTERS[grp];
      if (!starter && i > STARTERS[grp] + 1) return; // deep reserves barely play
      const inj = rollInjury(rng, cal, p, starter);
      if (!inj) return;
      p.injury = { type: inj.type, gamesOut: inj.games, since: state.date, seasonEnding: inj.games > remaining };
      p.history.unshift({ date: state.date, text: `${inj.type} injury — expected to miss ${inj.games} game${inj.games === 1 ? '' : 's'} (simulated)` });
      if (team === state.userTeam) {
        msg(state, {
          from: 'Head Athletic Trainer', kind: 'medical', urgent: inj.games >= LIMITS.irMinGames, link: `/franchise/player/${p.id}`,
          subject: `Injury: ${p.name} (${inj.type})`,
          body: `${p.pos} ${p.name} suffered a ${inj.type.toLowerCase()} injury against ${teamName(state, g.home === team ? g.away : g.home)}. Expected to miss ${inj.games} game${inj.games === 1 ? '' : 's'}${p.injury.seasonEnding ? ' — likely the rest of the season' : ''}.` +
            (inj.games >= LIMITS.irMinGames ? `\n\nRecommendation: place him on injured reserve to open a roster spot (minimum ${LIMITS.irMinGames} games; ${LIMITS.irReturns - (state.irReturns[team] ?? 0)} return designations left).` : ''),
        });
      } else if (p.ca >= 78 && inj.games >= 3) {
        news(state, `${teamName(state, team)} ${p.pos} ${p.name} out ${p.injury.seasonEnding ? 'for the season' : `${inj.games} games`} (${inj.type.toLowerCase()})`, team);
      }
    });
  }
  // elevated practice-squad players revert after the game
  for (const p of ps) if (p.elevated) { p.elevated = false; p.elevations++; }
}

function aiRoster(state: FranchiseState, rng: Rng, team: string, isUser: boolean) {
  const ps = () => teamPlayers(state, team);
  // IR placement for multi-week injuries
  for (const p of ps()) if (p.list === 'active' && p.injury && p.injury.gamesOut >= LIMITS.irMinGames) placeIR(state, p.id, team);
  // activate recovered reserve players if room (or if clearly better than the worst at the spot)
  for (const p of ps()) {
    if (!['ir', 'ir_return', 'pup', 'nfi'].includes(p.list) || p.injury) continue;
    if (p.irGames < LIMITS.irMinGames && (p.list === 'ir' || p.list === 'ir_return')) continue;
    if ((state.irReturns[team] ?? 0) >= LIMITS.irReturns && (p.list === 'ir' || p.list === 'ir_return')) continue;
    if (counts(state, team).active >= LIMITS.active) {
      const worst = ps().filter((x) => x.list === 'active' && x.group === p.group && !x.injury).sort((a, b) => a.ca - b.ca)[0];
      if (!worst || worst.ca + 5 > p.ca) continue;
      release(state, worst.id, team);
    }
    activateIR(state, p.id, team);
  }
  // a club cannot play without a healthy kicker, punter and long snapper: make room if needed
  for (const g of ['K', 'P', 'LS'] as PosGroup[]) {
    if (ps().some((p) => p.list === 'active' && p.group === g && !p.injury)) continue;
    if (counts(state, team).active >= LIMITS.active) {
      const cut = ps().filter((p) => p.list === 'active' && !['QB', 'K', 'P', 'LS'].includes(p.group)).sort((a, b) => a.ca - b.ca)[0];
      if (!cut) continue; release(state, cut.id, team);
      if (isUser) note(state, `Assistant GM released ${cut.name} to make room for a ${g}.`);
    }
    const fromPS = ps().filter((p) => isPS(p) && p.list !== 'ps_inj' && p.group === g && !p.injury)[0];
    if (fromPS && promote(state, fromPS.id, team).ok) { if (isUser) note(state, `Assistant GM signed ${fromPS.name} from the practice squad.`); continue; }
    const fa = bestFA(state, g);
    if (fa && signFA(state, fa.id, { list: 'active' }, team).ok && isUser) note(state, `Assistant GM signed free agent ${fa.name}.`);
  }
  // fill the 53 at the positions with the biggest healthy shortfall
  for (let guard = 0; guard < 10 && counts(state, team).active < LIMITS.active; guard++) {
    const healthy = (g: PosGroup) => ps().filter((p) => p.list === 'active' && p.group === g && !p.injury).length;
    const need = (Object.keys(MIN_BY_GROUP) as PosGroup[]).map((g) => [g, MIN_BY_GROUP[g] - healthy(g)] as [PosGroup, number]).sort((a, b) => b[1] - a[1])[0];
    const g = need[1] > 0 ? need[0] : (['CB', 'WR', 'EDGE', 'LB', 'OT', 'IOL', 'S', 'IDL'] as PosGroup[])[rng.int(0, 7)];
    const fromPS = ps().filter((p) => isPS(p) && p.list !== 'ps_inj' && p.group === g && !p.injury).sort((a, b) => b.ca - a.ca)[0];
    if (fromPS && promote(state, fromPS.id, team).ok) { if (isUser) note(state, `Assistant GM signed ${fromPS.name} from the practice squad.`); continue; }
    const fa = bestFA(state, g);
    if (fa && signFA(state, fa.id, { list: 'active' }, team).ok) { if (isUser) note(state, `Assistant GM signed free agent ${fa.name}.`); continue; }
    break;
  }
  // over the limit (e.g. after activations): release the weakest healthy depth
  while (counts(state, team).active > LIMITS.active) {
    const cut = ps().filter((p) => p.list === 'active').sort((a, b) => a.ca - b.ca)[0];
    if (!cut) break; release(state, cut.id, team);
    if (isUser) note(state, `Assistant GM released ${cut.name} to get to ${LIMITS.active}.`);
  }
  // practice squad over 16 or over the veteran allowance: release the weakest
  for (let guard = 0; guard < 6; guard++) {
    const c = counts(state, team);
    const vetOver = c.psVets > LIMITS.psVets;
    if (c.ps <= LIMITS.ps && !vetOver) break;
    const pool = ps().filter((p) => isPS(p) && p.list !== 'ps_inj' && p.list !== 'ps_intl' && (!vetOver || isPsVet(p))).sort((a, b) => a.ca - b.ca);
    if (!pool[0]) break; release(state, pool[0].id, team);
    if (isUser) note(state, `Assistant GM released ${pool[0].name} from the practice squad.`);
  }
  // keep a full practice squad (weekly)
  if (new Date(state.date + 'T12:00:00Z').getUTCDay() === 3) {
    for (let guard = 0; guard < 4 && counts(state, team).ps < LIMITS.ps - 1; guard++) {
      const g = (['WR', 'CB', 'OT', 'IOL', 'EDGE', 'LB', 'S', 'RB', 'IDL', 'TE', 'QB'] as PosGroup[])[rng.int(0, 10)];
      const fa = bestFA(state, g, true);
      if (!fa || teamCap(state, team).space < psSalary(state, fa)) break;
      signFA(state, fa.id, { list: 'ps' }, team);
    }
  }
}

function bestFA(state: FranchiseState, g: PosGroup, psOnly = false) {
  let best: Player | null = null;
  for (const p of Object.values(state.players)) {
    if (p.list !== 'fa' || p.group !== g || p.injury) continue;
    if (psOnly && p.exp >= 4) continue;
    const age = ageOn(p.birth, state.date) ?? 27;
    if (age > 34) continue;
    if (!best || p.ca > best.ca) best = p;
  }
  return best;
}

function aiWaiverClaims(state: FranchiseState) {
  for (const p of Object.values(state.players)) {
    if (p.list !== 'waivers' || !p.waiver || p.waiver.claims.length >= 3) continue;
    if (p.ca < 52) continue;
    for (const t of state.teams) {
      if (t.abbr === state.userTeam || t.abbr === p.waiver.from || p.waiver.claims.includes(t.abbr)) continue;
      const worst = teamPlayers(state, t.abbr).filter((x) => x.list === 'active' && x.group === p.group).sort((a, b) => a.ca - b.ca)[0];
      if (worst && p.ca > worst.ca + 6 && teamCap(state, t.abbr).space > 3) claim(state, p.id, t.abbr);
    }
  }
}

function note(state: FranchiseState, text: string) { state.log.unshift({ date: state.date, text }); }

export function teamName(state: FranchiseState, abbr: string) { return state.teams.find((t) => t.abbr === abbr)?.name ?? abbr; }

function userResultMessage(state: FranchiseState, g: Game) {
  const r = g.result!;
  const home = g.home === state.userTeam;
  const us = home ? r.home : r.away, them = home ? r.away : r.home;
  const opp = home ? g.away : g.home;
  const res = us > them ? 'Win' : us < them ? 'Loss' : 'Tie';
  const rows = standings(state);
  msg(state, {
    from: 'Assistant GM', kind: 'result', link: `/franchise/schedule`,
    subject: `${res}: ${teamName(state, state.userTeam)} ${us}-${them} ${teamName(state, opp)}${r.ot ? ' (OT)' : ''}`,
    body: `${g.type === 'REG' ? `Week ${g.week}` : roundName(g.type)} — ${home ? 'home' : 'away'} vs ${teamName(state, opp)}. Final ${us}-${them}${r.ot ? ' in overtime' : ''}. Record: ${teamRecord(rows, state.userTeam)}.\n\n` +
      'This result came from the provisional results model (Phase 1). Play-by-play arrives with the Phase 3 match engine.',
  });
}

export const roundName = (t: string) => ({ WC: 'Wild Card', DIV: 'Divisional Round', CON: 'Conference Championship', SB: 'Super Bowl' } as Record<string, string>)[t] ?? 'Regular season';

function weeklyDigest(state: FranchiseState) {
  const rows = standings(state);
  const lastWeek = Math.max(0, ...state.games.filter((g) => g.result && g.type === 'REG').map((g) => g.week));
  if (!lastWeek) return;
  const leaders = Object.values(rows).sort((a, b) => b.pct - a.pct || (b.pf - b.pa) - (a.pf - a.pa)).slice(0, 3).map((r) => `${r.team} ${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`);
  news(state, `Week ${lastWeek} in the books: ${leaders.join(', ')} lead the league`);
}

function startPlayoffs(state: FranchiseState, kd: ReturnType<typeof keyDates>) {
  const s = seeds(state);
  state.phase = 'playoffs';
  const wc = kd.wildCard;
  const pairs: [string, string, string][] = [];
  for (const conf of ['AFC', 'NFC'] as const) {
    const x = s[conf];
    pairs.push([x[1], x[6], conf], [x[2], x[5], conf], [x[3], x[4], conf]);
  }
  const days = [wc, wc, addDays(wc, 1), addDays(wc, 1), addDays(wc, 1), addDays(wc, 2)];
  pairs.forEach(([h, a], i) => state.games.push({ id: `${state.season}_WC_${a}_${h}`, week: 19, type: 'WC', date: days[i], home: h, away: a, neutral: false, result: null }));
  const inPO = [...s.AFC, ...s.NFC];
  news(state, `Playoff field set — AFC #1 ${s.AFC[0]}, NFC #1 ${s.NFC[0]} earn byes`);
  msg(state, {
    from: 'League Office', kind: 'league', subject: inPO.includes(state.userTeam) ? 'You are in the playoffs' : 'Your season is over',
    body: `AFC seeds: ${s.AFC.map((t, i) => `${i + 1}. ${t}`).join(', ')}\nNFC seeds: ${s.NFC.map((t, i) => `${i + 1}. ${t}`).join(', ')}`,
  });
  state.playoffSeeds = s;
}

function progressPlayoffs(state: FranchiseState, kd: ReturnType<typeof keyDates>) {
  const s = state.playoffSeeds!;
  const winners = (type: string) => state.games.filter((g) => g.type === type && g.result).map((g) => (g.result!.home > g.result!.away ? g.home : g.away));
  const done = (type: string) => state.games.filter((g) => g.type === type).length > 0 && state.games.filter((g) => g.type === type).every((g) => g.result);
  const exists = (type: string) => state.games.some((g) => g.type === type);
  const seedOf = (t: string) => { for (const c of ['AFC', 'NFC'] as const) { const i = s[c].indexOf(t); if (i >= 0) return { conf: c, seed: i + 1 }; } return { conf: 'AFC' as const, seed: 9 }; };
  if (done('WC') && !exists('DIV')) {
    const w = winners('WC');
    for (const conf of ['AFC', 'NFC'] as const) {
      const alive = [s[conf][0], ...w.filter((t) => seedOf(t).conf === conf)].sort((a, b) => seedOf(a).seed - seedOf(b).seed);
      const days = [kd.divisional, addDays(kd.divisional, 1)];
      state.games.push({ id: `${state.season}_DIV_${alive[3]}_${alive[0]}`, week: 20, type: 'DIV', date: conf === 'AFC' ? days[0] : days[1], home: alive[0], away: alive[3], neutral: false, result: null });
      state.games.push({ id: `${state.season}_DIV_${alive[2]}_${alive[1]}`, week: 20, type: 'DIV', date: conf === 'AFC' ? days[1] : days[0], home: alive[1], away: alive[2], neutral: false, result: null });
    }
  } else if (done('DIV') && !exists('CON')) {
    const w = winners('DIV');
    for (const conf of ['AFC', 'NFC'] as const) {
      const alive = w.filter((t) => seedOf(t).conf === conf).sort((a, b) => seedOf(a).seed - seedOf(b).seed);
      state.games.push({ id: `${state.season}_CON_${alive[1]}_${alive[0]}`, week: 21, type: 'CON', date: kd.conference, home: alive[0], away: alive[1], neutral: false, result: null });
    }
  } else if (done('CON') && !exists('SB')) {
    const w = winners('CON');
    const afc = w.find((t) => seedOf(t).conf === 'AFC')!, nfc = w.find((t) => seedOf(t).conf === 'NFC')!;
    state.games.push({ id: `${state.season}_SB_${afc}_${nfc}`, week: 22, type: 'SB', date: kd.superBowl, home: nfc, away: afc, neutral: true, result: null });
  } else if (done('SB')) {
    const champ = winners('SB')[0];
    state.phase = 'season_over';
    news(state, `${teamName(state, champ)} win the Super Bowl`, champ);
    msg(state, {
      from: 'Ownership', kind: 'owner', subject: champ === state.userTeam ? 'World champions' : `Season review: ${state.season}`,
      body: (champ === state.userTeam ? 'You have delivered a championship. ' : `The ${teamName(state, champ)} are champions. `) +
        `Final record: ${teamRecord(standings(state), state.userTeam)}.\n\nThe ${state.season + 1} offseason — the combine, free agency and the 7-round draft — unlocks in Phase 2. Your save will carry forward.`,
    });
  }
}

export function continueUntil(state: FranchiseState, cal: Calibration, stop: 'day' | 'game' | 'week'): { days: number; blocked?: string[] } {
  let days = 0;
  const startDate = state.date;
  for (let i = 0; i < 40; i++) {
    const before = state.inbox.filter((m) => m.urgent && !m.read).length;
    const r = advanceDay(state, cal);
    if (r.blocked) return { days, blocked: r.blocked };
    days++;
    if (stop === 'day' || state.phase === 'season_over') break;
    if (state.inbox.filter((m) => m.urgent && !m.read).length > before) break;
    if (stop === 'game' && (userGameOn(state) || r.played.some((g) => g.home === state.userTeam || g.away === state.userTeam))) break;
    if (stop === 'week' && i >= 6) break;
    if (state.date === startDate) break;
  }
  return { days };
}
