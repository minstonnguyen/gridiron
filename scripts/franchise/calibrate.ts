/**
 * Franchise Mode calibration + rules test harness.
 *   npx tsx scripts/franchise/calibrate.ts <seedDir> [seasons] [--write out.json]
 * Simulates full regular seasons from week 1 with the provisional results model and compares to real NFL
 * 2016–2025 targets; then runs unit checks on the cap engine, roster rules, calendar and draft-potential calibration.
 * Exits non-zero if any check fails (used in CI before deploy).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { Calibration, FranchiseState, Seed } from '../../src/franchise/types';
import { newGame, advanceDay } from '../../src/franchise/engine';
import { keyDates } from '../../src/franchise/calendar';
import { releaseImpact, teamCap, leagueYear } from '../../src/franchise/cap';
import { counts, release, signFA, elevate, placeIR, activateIR, LIMITS } from '../../src/franchise/roster';
import { draftBucket, tierProbs } from '../../src/franchise/attributes';
import { standings } from '../../src/franchise/standings';

const dir = process.argv[2] ?? 'dist/data/franchise';
const seasons = Number(process.argv[3] ?? 12);
const outIdx = process.argv.indexOf('--write');
const seed: Seed = JSON.parse(readFileSync(`${dir}/seed.json`, 'utf8'));
const cal: Calibration = JSON.parse(readFileSync(`${dir}/calibration.json`, 'utf8'));
for (const n of ['draftHitRates', 'pickValue', 'combineDist']) if (!(cal as any)[n]) (cal as any)[n] = JSON.parse(readFileSync(`src/franchise/calibration/${n}.json`, 'utf8'));

// IndexedDB-free environment: the engine is pure TS.
const checks: { name: string; target: string; value: string; pass: boolean }[] = [];
const check = (name: string, value: number, lo: number, hi: number, fmt = (x: number) => x.toFixed(3)) =>
  checks.push({ name, target: `${fmt(lo)} – ${fmt(hi)}`, value: fmt(value), pass: value >= lo && value <= hi });

// ---------- results model ----------
const pts: number[] = []; let absM = 0, homeW = 0, decided = 0, ties = 0, ot = 0, one = 0, games = 0; const winPcts: number[] = []; let injuries = 0, teamSeasons = 0;
const t0 = Date.now();
for (let s = 0; s < seasons; s++) {
  const st = newGame(seed, cal, { team: seed.teams[s % 32].abbr, coach: 'Test Coach', name: 'cal', ironman: false, assistantRoster: true });
  for (const g of st.games) g.result = null;
  st.date = st.games.map((g) => g.date).sort()[0];
  let guard = 0;
  while (st.games.some((g) => g.type === 'REG' && !g.result) && guard++ < 200) {
    const r = advanceDay(st, cal);
    if (r.blocked) throw new Error('blocked: ' + r.blocked.join('; '));
  }
  const injCount = Object.values(st.players).reduce((n, p) => n + p.history.filter((h) => h.text.includes('injury — expected')).length, 0);
  injuries += injCount; teamSeasons += 32;
  for (const g of st.games.filter((x) => x.type === 'REG')) {
    const r = g.result!; games++;
    pts.push(r.home, r.away);
    if (r.home === r.away) ties++; else if (!g.neutral) { decided++; if (r.home > r.away) homeW++; }
    if (r.ot) ot++;
    if (Math.abs(r.home - r.away) <= 8) one++;
    absM += Math.abs(r.home - r.away);
  }
  const rows = standings(st);
  for (const r of Object.values(rows)) winPcts.push(r.pct);
}
const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
const sd = Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length);
const wm = winPcts.reduce((a, b) => a + b, 0) / winPcts.length;
const wsd = Math.sqrt(winPcts.reduce((a, b) => a + (b - wm) ** 2, 0) / winPcts.length);
const S = cal.scoring;
check('Mean points per team-game', mean, S.mean_team_points - 0.8, S.mean_team_points + 0.8, (x) => x.toFixed(2));
check('SD points per team-game', sd, S.sd_team_points - 0.8, S.sd_team_points + 0.8, (x) => x.toFixed(2));
check('Home win rate (non-neutral, decided)', homeW / decided, S.home_win_rate - 0.03, S.home_win_rate + 0.03);
check('Overtime rate', ot / games, S.ot_rate - 0.025, S.ot_rate + 0.025);
check('Tie rate', ties / games, 0, 0.012);
check('One-score games (≤8 pts)', one / games, S.one_score_rate - 0.04, S.one_score_rate + 0.04);
check('Mean absolute margin', absM / games, S.mean_abs_margin - 1, S.mean_abs_margin + 1, (x) => x.toFixed(2));
check('SD of team win % (parity)', wsd, S.sd_team_win_pct - 0.025, S.sd_team_win_pct + 0.025);
const realInjPerTeam = Object.values(cal.injuries.by_group).reduce((s, g) => s + g.episodes, 0) / (10 * 32);
check('Injuries (multi-game episodes) per team-season', injuries / teamSeasons, realInjPerTeam * 0.7, realInjPerTeam * 1.4, (x) => x.toFixed(1));
const simSeconds = (Date.now() - t0) / 1000 / seasons;

// ---------- draft potential calibration (current rookies' hidden ceilings vs real hit rates) ----------
// Hidden ceilings are random per career, so pool several careers and test the mean against the real rate.
// The tolerance stays at the width for one class (2.5 standard errors at one class's sample size).
{
  const CAREERS = 8;
  const bucketTiers: Record<string, { n: number; starterPlus: number; expected: number }> = {};
  for (let k = 0; k < CAREERS; k++) {
    const st = newGame(seed, cal, { team: seed.teams[k].abbr, coach: 'x', name: 'x', ironman: false, assistantRoster: true });
    for (const p of Object.values(st.players)) {
      if (!p.draft?.year || p.draft.year !== st.season) continue;
      const b = draftBucket(p.draft.round, p.draft.pick); if (!b) continue;
      const probs = tierProbs(cal, p.group, b);
      const x = (bucketTiers[b] ??= { n: 0, starterPlus: 0, expected: 0 });
      x.n++; x.expected += probs.elite + probs.pro_bowl + probs.starter; if (p.pa >= 70) x.starterPlus++;
    }
  }
  for (const [b, x] of Object.entries(bucketTiers)) {
    const perClass = x.n / CAREERS;
    if (perClass < 15) continue;
    const exp = x.expected / x.n, got = x.starterPlus / x.n, se = Math.sqrt(exp * (1 - exp) / perClass);
    check(`${seed.season} rookies ${b}: share with starter-or-better ceiling (${CAREERS} careers, ${perClass} per class)`, got, Math.max(0, exp - 2.5 * se), Math.min(1, exp + 2.5 * se));
  }
}

// ---------- rules unit checks ----------
const unit: { name: string; pass: boolean; detail?: string }[] = [];
const t = (name: string, fn: () => void) => { try { fn(); unit.push({ name, pass: true }); } catch (e: any) { unit.push({ name, pass: false, detail: e.message }); } };
const base = (): FranchiseState => newGame(seed, cal, { team: 'CIN', coach: 'Unit', name: 'unit', ironman: false, assistantRoster: false });

t('Calendar: key dates match the official 2026-27 NFL calendar', () => {
  const kd = keyDates(seed.schedule.map((g) => ({ week: g.week, type: 'REG', date: g.date })));
  if (seed.season === 2026) {
    assert.equal(kd.tradeDeadline, '2026-11-10'); assert.equal(kd.vestedWaivers, '2026-11-11'); assert.equal(kd.wildCard, '2027-01-16');
    assert.equal(kd.divisional, '2027-01-23'); assert.equal(kd.conference, '2027-01-31'); assert.equal(kd.superBowl, '2027-02-14');
  }
});
t('Cap: release before June 1 accelerates all future proration', () => {
  const s = base(); const p = Object.values(s.players).find((x) => x.contract?.src === 'otc' && x.contract.years.filter((y) => y.year > s.season && y.prorated > 1).length >= 2)!;
  s.date = `${s.season + 1}-04-01`; s.phase = 'season_over';
  const imp = releaseImpact(s, p, s.date);
  const fut = p.contract!.years.filter((y) => y.year > leagueYear(s.date)).reduce((a, y) => a + y.prorated + Math.min(y.base, y.guaranteed), 0);
  assert.ok(!imp.postJune1); assert.equal(imp.deadNextYear, 0); assert.ok(imp.deadThisYear >= fut - 0.01);
});
t('Cap: in-season release splits dead money into this year and next year', () => {
  const s = base(); const p = Object.values(s.players).find((x) => x.team === 'CIN' && x.contract?.src === 'otc' && x.contract.years.some((y) => y.year > s.season && y.prorated > 0.5))!;
  const imp = releaseImpact(s, p);
  assert.ok(imp.postJune1); assert.ok(imp.deadNextYear > 0); assert.ok(imp.deadThisYear <= imp.capHitBefore + 1e-6);
});
t('Cap: releasing a player books dead money and frees the remaining non-guaranteed salary', () => {
  const s = base(); const p = Object.values(s.players).filter((x) => x.team === 'CIN' && x.list === 'active' && x.contract?.src === 'otc').sort((a, b) => (b.contract!.apy ?? 0) - (a.contract!.apy ?? 0))[3];
  const before = teamCap(s, 'CIN'); const imp = releaseImpact(s, p);
  assert.ok(release(s, p.id).ok);
  const after = teamCap(s, 'CIN');
  assert.ok(Math.abs((after.used) - (before.used - imp.savingsThisYear)) < 0.01, `used ${before.used} -> ${after.used}, savings ${imp.savingsThisYear}`);
});
t('Roster: 53-man limit blocks a 54th signing', () => {
  const s = base(); while (counts(s, 'CIN').active < 53) { const fa = Object.values(s.players).find((x) => x.list === 'fa')!; signFA(s, fa.id, { list: 'active', apy: 5 }); }
  const fa = Object.values(s.players).find((x) => x.list === 'fa')!; const r = signFA(s, fa.id, { list: 'active', apy: 5 }); assert.equal(r.ok, false);
});
t('Roster: practice squad limit 16 and 6 veterans', () => {
  const s = base(); let guard = 0;
  while (counts(s, 'CIN').psVets < LIMITS.psVets && guard++ < 50) { const fa = Object.values(s.players).find((x) => x.list === 'fa' && x.exp > 2)!; signFA(s, fa.id, { list: 'ps' }); }
  const fa = Object.values(s.players).find((x) => x.list === 'fa' && x.exp > 2)!; assert.equal(signFA(s, fa.id, { list: 'ps' }).ok, false);
});
t('Roster: elevations max 2 per game and 3 per player per season', () => {
  const s = base(); const ps = Object.values(s.players).filter((x) => x.team === 'CIN' && x.list === 'ps' && !x.injury);
  assert.ok(elevate(s, ps[0].id, true).ok); assert.ok(elevate(s, ps[1].id, true).ok); assert.equal(elevate(s, ps[2].id, true).ok, false);
  ps[2].elevations = 3; elevate(s, ps[0].id, false); assert.equal(elevate(s, ps[2].id, true).ok, false);
});
t('Roster: IR requires 4 games before activation', () => {
  const s = base(); const p = Object.values(s.players).find((x) => x.team === 'CIN' && x.list === 'active')!;
  p.injury = { type: 'Knee', gamesOut: 2, since: s.date, seasonEnding: false };
  assert.ok(placeIR(s, p.id).ok); p.injury = null; p.irGames = 3; assert.equal(activateIR(s, p.id).ok, false); p.irGames = 4;
  const c = counts(s, 'CIN'); if (c.active >= 53) { const x = Object.values(s.players).find((y) => y.team === 'CIN' && y.list === 'active')!; release(s, x.id); }
  assert.ok(activateIR(s, p.id).ok);
});
t('Roster: non-vested players go to waivers; vested veterans are free before the deadline', () => {
  const s = base();
  const young = Object.values(s.players).find((x) => x.team === 'CIN' && x.list === 'active' && !x.vet)!;
  const vet = Object.values(s.players).find((x) => x.team === 'CIN' && x.list === 'active' && x.vet)!;
  release(s, young.id); release(s, vet.id);
  assert.equal(young.list, 'waivers'); assert.equal(vet.list, s.date < keyDates(s.games).vestedWaivers ? 'fa' : 'waivers');
});

const failed = checks.filter((c) => !c.pass).length + unit.filter((u) => !u.pass).length;
const report = { generated_at: new Date().toISOString(), seed_generated_at: seed.generated_at, seasons_simulated: seasons, seconds_per_season: Number(simSeconds.toFixed(2)), checks, unit, failed };
console.table(checks);
console.table(unit);
console.log(`seconds per simulated regular season: ${simSeconds.toFixed(2)}`);
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify(report, null, 1));
if (failed) { console.error(`${failed} calibration/rules checks failed`); process.exit(1); }
