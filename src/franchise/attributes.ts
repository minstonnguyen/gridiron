import type { Calibration, Player, PosGroup, SeedPlayer } from './types';
import { Rng } from './rng';

/**
 * FM-style attribute model (1–20 scale).
 *
 * The hidden "true" values are built per save from public evidence:
 *  - GRIDIRON rating + its stat-component percentiles (real play-by-play / NGS / PFR metrics)
 *  - contract APY percentile within the position (the market's own valuation)
 *  - real depth-chart rank, draft capital, experience
 *  - combine measurements for the physical attributes
 * plus per-save noise, so two careers never share identical truths ("diverge immediately").
 * Personality traits are simulated and are labelled that way in the UI.
 */

export interface AttrDef { key: string; label: string; evidence?: string[] }

export const PHYSICAL: AttrDef[] = [
  { key: 'spd', label: 'Speed' }, { key: 'acc', label: 'Acceleration' }, { key: 'agi', label: 'Agility' },
  { key: 'str', label: 'Strength' }, { key: 'jmp', label: 'Jumping' }, { key: 'sta', label: 'Stamina' }, { key: 'fit', label: 'Natural Fitness' },
];
export const MENTAL: AttrDef[] = [
  { key: 'awr', label: 'Awareness', evidence: ['consistency', 'impact_epa_rate'] },
  { key: 'dec', label: 'Decisions', evidence: ['consistency'] },
  { key: 'cmp', label: 'Composure', evidence: ['recent_form'] },
  { key: 'con', label: 'Consistency', evidence: ['consistency'] },
  { key: 'dis', label: 'Discipline', evidence: ['penalty_rate'] },
  { key: 'ldr', label: 'Leadership' },
  { key: 'wrk', label: 'Work Rate' },
];

export const TECHNICAL: Record<PosGroup, AttrDef[]> = {
  QB: [
    { key: 'sac', label: 'Short Accuracy', evidence: ['completion_pct', 'cpoe', 'on_target_pct'] },
    { key: 'dac', label: 'Deep Accuracy', evidence: ['adj_yards_per_dropback', 'td_rate', 'bad_throw_pct'] },
    { key: 'arm', label: 'Arm Strength', evidence: ['ngs_aggressiveness', 'adj_yards_per_dropback'] },
    { key: 'pkt', label: 'Pocket Presence', evidence: ['sack_rate', 'pressure_to_sack'] },
    { key: 'red', label: 'Reading Defences', evidence: ['epa_per_dropback', 'int_rate', 'pass_success_rate'] },
    { key: 'run', label: 'Throw on the Run', evidence: ['qb_rush_epa', 'on_target_pct'] },
    { key: 'scr', label: 'Scrambling', evidence: ['qb_rush_epa'] },
    { key: 'bsc', label: 'Ball Security', evidence: ['int_rate', 'fumble_rate'] },
  ],
  RB: [
    { key: 'vis', label: 'Vision', evidence: ['rush_success_rate', 'ngs_rush_yards_over_expected_per_att', 'rush_epa_per_carry'] },
    { key: 'elu', label: 'Elusiveness', evidence: ['broken_tackle_rate', 'rush_explosive_rate'] },
    { key: 'btk', label: 'Break Tackle', evidence: ['yac_per_att', 'broken_tackle_rate'] },
    { key: 'bsc', label: 'Ball Security', evidence: ['fumble_rate'] },
    { key: 'cth', label: 'Catching', evidence: ['rec_epa_per_target', 'catch_rate'] },
    { key: 'pbk', label: 'Pass Blocking' },
  ],
  WR: [
    { key: 'rte', label: 'Route Running', evidence: ['ngs_avg_separation', 'target_share', 'target_success_rate'] },
    { key: 'hnd', label: 'Hands', evidence: ['drop_pct', 'catch_rate'] },
    { key: 'rel', label: 'Release', evidence: ['target_share', 'yards_per_target'] },
    { key: 'cit', label: 'Contested Catch', evidence: ['catch_rate', 'receiving_tds'] },
    { key: 'rac', label: 'Run After Catch', evidence: ['yac_per_rec', 'ngs_avg_yac_above_expectation'] },
    { key: 'blk', label: 'Blocking' },
  ],
  TE: [
    { key: 'rte', label: 'Route Running', evidence: ['ngs_avg_separation', 'target_share'] },
    { key: 'hnd', label: 'Hands', evidence: ['drop_pct', 'catch_rate'] },
    { key: 'cit', label: 'Contested Catch', evidence: ['catch_rate', 'receiving_tds'] },
    { key: 'rac', label: 'Run After Catch', evidence: ['yac_per_rec', 'ngs_avg_yac_above_expectation'] },
    { key: 'rbk', label: 'Run Blocking', evidence: ['team_rush_success'] },
    { key: 'pbk', label: 'Pass Blocking', evidence: ['team_pressure_rate'] },
  ],
  OT: [
    { key: 'pbk', label: 'Pass Blocking', evidence: ['team_pressure_rate', 'team_sack_rate'] },
    { key: 'rbk', label: 'Run Blocking', evidence: ['team_rush_success', 'team_rush_epa'] },
    { key: 'ftw', label: 'Footwork', evidence: ['team_pressure_rate'] },
    { key: 'hnd', label: 'Hand Technique', evidence: ['penalty_rate'] },
    { key: 'anc', label: 'Anchor', evidence: ['team_sack_rate'] },
    { key: 'mov', label: 'Blocking in Space', evidence: ['team_rush_epa'] },
  ],
  IOL: [
    { key: 'pbk', label: 'Pass Blocking', evidence: ['team_pressure_rate', 'team_sack_rate'] },
    { key: 'rbk', label: 'Run Blocking', evidence: ['team_rush_success', 'team_rush_epa'] },
    { key: 'ftw', label: 'Footwork', evidence: ['team_pressure_rate'] },
    { key: 'hnd', label: 'Hand Technique', evidence: ['penalty_rate'] },
    { key: 'anc', label: 'Anchor', evidence: ['team_sack_rate'] },
    { key: 'mov', label: 'Pulling', evidence: ['team_rush_epa'] },
  ],
  EDGE: [
    { key: 'prm', label: 'Pass Rush Moves', evidence: ['pressure_rate', 'hurry_rate'] },
    { key: 'pwr', label: 'Power Rush', evidence: ['qb_hit_rate', 'sack_rate'] },
    { key: 'bsh', label: 'Block Shedding', evidence: ['stop_rate', 'tfl_rate'] },
    { key: 'rund', label: 'Run Defence', evidence: ['stop_rate', 'tfl_rate'] },
    { key: 'pur', label: 'Pursuit', evidence: ['tackle_rate'] },
    { key: 'tkl', label: 'Tackling', evidence: ['missed_tackle_pct'] },
  ],
  IDL: [
    { key: 'prm', label: 'Pass Rush Moves', evidence: ['pressure_rate', 'hurry_rate'] },
    { key: 'pwr', label: 'Power Rush', evidence: ['qb_hit_rate', 'sack_rate'] },
    { key: 'bsh', label: 'Block Shedding', evidence: ['stop_rate', 'tfl_rate'] },
    { key: 'rund', label: 'Run Defence', evidence: ['stop_rate', 'tfl_rate'] },
    { key: 'pur', label: 'Pursuit', evidence: ['tackle_rate'] },
    { key: 'tkl', label: 'Tackling', evidence: ['missed_tackle_pct'] },
  ],
  LB: [
    { key: 'tkl', label: 'Tackling', evidence: ['missed_tackle_pct', 'tackle_rate'] },
    { key: 'pur', label: 'Pursuit', evidence: ['tackle_rate', 'stop_rate'] },
    { key: 'bsh', label: 'Block Shedding', evidence: ['stop_rate', 'tfl_rate'] },
    { key: 'prc', label: 'Play Recognition', evidence: ['stop_rate', 'impact_epa_rate'] },
    { key: 'zcv', label: 'Zone Coverage', evidence: ['passer_rating_allowed', 'yds_per_tgt_allowed'] },
    { key: 'mcv', label: 'Man Coverage', evidence: ['cmp_pct_allowed', 'yds_per_tgt_allowed'] },
    { key: 'blz', label: 'Blitzing', evidence: ['pressure_rate'] },
  ],
  CB: [
    { key: 'mcv', label: 'Man Coverage', evidence: ['cmp_pct_allowed', 'yds_per_tgt_allowed'] },
    { key: 'zcv', label: 'Zone Coverage', evidence: ['passer_rating_allowed', 'yds_per_tgt_allowed'] },
    { key: 'prs', label: 'Press', evidence: ['cmp_pct_allowed'] },
    { key: 'bsk', label: 'Ball Skills', evidence: ['ball_skills_rate', 'passes_defended', 'interceptions_defense'] },
    { key: 'tkl', label: 'Tackling', evidence: ['missed_tackle_pct'] },
    { key: 'prc', label: 'Play Recognition', evidence: ['passer_rating_allowed'] },
  ],
  S: [
    { key: 'zcv', label: 'Zone Coverage', evidence: ['passer_rating_allowed', 'yds_per_tgt_allowed'] },
    { key: 'mcv', label: 'Man Coverage', evidence: ['cmp_pct_allowed'] },
    { key: 'bsk', label: 'Ball Skills', evidence: ['ball_skills_rate', 'passes_defended', 'interceptions_defense'] },
    { key: 'tkl', label: 'Tackling', evidence: ['missed_tackle_pct', 'tackle_rate'] },
    { key: 'hit', label: 'Hit Power', evidence: ['forced_fumbles', 'stop_rate'] },
    { key: 'prc', label: 'Play Recognition', evidence: ['stop_rate', 'passer_rating_allowed'] },
  ],
  K: [
    { key: 'kpw', label: 'Kick Power', evidence: ['avg_fg_made_distance', 'fg50_pct', 'kickoff_touchback_rate'] },
    { key: 'kac', label: 'Kick Accuracy', evidence: ['fg_pct', 'pat_pct'] },
  ],
  P: [
    { key: 'ppw', label: 'Punt Power', evidence: ['gross_avg', 'punt_touchback_rate'] },
    { key: 'pac', label: 'Punt Placement', evidence: ['net_avg', 'inside20_rate'] },
  ],
  LS: [
    { key: 'snp', label: 'Snapping' },
    { key: 'tkl', label: 'Coverage Tackling' },
  ],
};

export const PERSONALITY = [
  { key: 'professionalism', label: 'Professionalism' }, { key: 'ambition', label: 'Ambition' }, { key: 'loyalty', label: 'Loyalty' },
  { key: 'pressure', label: 'Pressure' }, { key: 'temperament', label: 'Temperament' }, { key: 'injury_prone', label: 'Injury Proneness' },
];

/** How many players at each group start (used for depth rank and team strength). */
export const STARTERS: Record<PosGroup, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, IOL: 3, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };

// group means used when combine data is missing (nflverse combine, 2010+; src/franchise/calibration/combineDist.json)
const FORTY_MEAN: Record<PosGroup, number> = { QB: 4.79, RB: 4.57, WR: 4.5, TE: 4.73, OT: 5.2, IOL: 5.23, EDGE: 4.74, IDL: 5.06, LB: 4.68, CB: 4.49, S: 4.54, K: 4.92, P: 4.89, LS: 5.06 };
const STAMINA_BASE: Partial<Record<PosGroup, number>> = { WR: 15, CB: 15, S: 14, RB: 13, LB: 14, TE: 13, QB: 13, EDGE: 12, IDL: 10, OT: 12, IOL: 12, K: 10, P: 10, LS: 11 };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function ageOn(birth: string | null, date: string): number | null {
  if (!birth) return null;
  const b = new Date(birth + 'T00:00:00Z'), d = new Date(date + 'T00:00:00Z');
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export interface BuildContext {
  season: number; date: string; rng: Rng; cal: Calibration;
  apyPctById: Map<string, number>; depthRankById: Map<string, number>; pickValue: (pick: number) => number;
}

const BUCKETS = ['R1 top10', 'R1 11-32', 'R2', 'R3', 'R4', 'R5', 'R6-7'];
export function draftBucket(round: number | null | undefined, pick: number | null | undefined): string | null {
  if (!round) return null;
  if (round === 1) return (pick ?? 99) <= 10 ? 'R1 top10' : 'R1 11-32';
  return round >= 6 ? 'R6-7' : `R${round}`;
}

const TIER_PEAK: Record<string, [number, number]> = {
  elite: [88, 97], pro_bowl: [80, 89], starter: [70, 80], contributor: [58, 70], bust: [40, 58],
};

/** Hit-rate distribution for a position × draft bucket, shrunk toward the round average (k = 20 pseudo-picks). */
export function tierProbs(cal: Calibration, group: PosGroup, bucket: string): Record<string, number> {
  const hr = cal.draftHitRates;
  const tiers = ['elite', 'pro_bowl', 'starter', 'contributor', 'bust'];
  const overall = hr?.overall?.[bucket];
  if (!overall) return { elite: 0.01, pro_bowl: 0.01, starter: 0.08, contributor: 0.2, bust: 0.7 };
  const posKey = group === 'IOL' ? 'IOL' : group;
  const cell = hr.by_position?.[posKey]?.[bucket];
  const n = cell?.n ?? 0, k = 20;
  const out: Record<string, number> = {};
  for (const t of tiers) out[t] = cell ? (n * cell[t] + k * overall[t]) / (n + k) : overall[t];
  return out;
}

export function buildPlayer(sp: SeedPlayer, ctx: BuildContext): Player {
  const { rng, season, date } = ctx;
  const age = ageOn(sp.birth, date) ?? 26;
  const r = sp.rating;
  const conf = r?.confidence != null ? (r.confidence > 1 ? r.confidence / 100 : r.confidence) : 0;
  const games = r?.games ?? 0;
  const parts: [number, number][] = [];
  if (r?.overall != null && games > 0) parts.push([45 + 0.5 * r.overall, 3 * Math.max(0.15, conf) * Math.sqrt(Math.min(games, 17) / 17)]);
  const rookieDeal = sp.contract?.src === 'otc' && sp.draft?.year != null && sp.contract.signed === sp.draft.year && season - (sp.draft.year ?? 0) <= 4;
  const apyPct = ctx.apyPctById.get(sp.id) ?? null;
  if (apyPct != null && !rookieDeal) parts.push([25 + 0.7 * apyPct, 2]);
  const depthRank = ctx.depthRankById.get(sp.id) ?? null;
  const starters = STARTERS[sp.group];
  const qd = sp.status.startsWith('ps') ? 26 : depthRank == null ? 32 : depthRank <= starters ? 62 : depthRank <= starters * 2 ? 45 : 34;
  parts.push([qd, 1.5]);
  let draftValue: number | null = null;
  if (sp.draft?.pick) {
    draftValue = ctx.pickValue(sp.draft.pick);
    const w = Math.max(0, 1.6 - 0.4 * sp.exp);
    if (w > 0) parts.push([30 + 45 * draftValue, w]);
  } else if (sp.exp <= 2) parts.push([27, Math.max(0, 1.2 - 0.4 * sp.exp)]);
  const wsum = parts.reduce((s, [, w]) => s + w, 0);
  const q = parts.reduce((s, [v, w]) => s + v * w, 0) / wsum;
  const evidenceShare = (parts[0] && r?.overall != null ? parts[0][1] : 0) / wsum;
  const ca = clamp(q + rng.normal(0, 3 + 5 * (1 - evidenceShare)), 15, 99);

  // ---- potential (hidden ceiling) ----
  let pa = ca;
  const bucket = draftBucket(sp.draft?.round, sp.draft?.pick);
  const yearsIn = sp.draft?.year ? season - sp.draft.year : sp.exp;
  if (age <= 26 && yearsIn <= 2 && bucket) {
    // calibrated to real outcomes for this position and draft slot (docs/franchise/draft-hit-rates.md)
    const probs = tierProbs(ctx.cal, sp.group, bucket);
    const tier = rng.weighted(Object.entries(probs) as [string, number][]);
    const [lo, hi] = TIER_PEAK[tier];
    pa = Math.max(ca + 1, lo + rng.next() * (hi - lo));
  } else if (age <= 26) {
    pa = ca + Math.max(0, rng.normal((27 - age) * 2.2, 4));
  } else {
    pa = ca + Math.max(0, rng.normal(0.5, 1.5));
  }
  pa = clamp(pa, ca, 99);

  // ---- attributes ----
  const attrs: Record<string, number> = {};
  const toScale = (score100: number) => clamp(Math.round(1 + score100 * 0.19 + rng.normal(0, 1.1)), 1, 20);
  const pct = sp.pct ?? {};
  const evid = (keys?: string[]) => {
    const xs = (keys ?? []).map((k) => pct[k]).filter((x): x is number => typeof x === 'number');
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  for (const d of [...TECHNICAL[sp.group], ...MENTAL]) {
    const e = evid(d.evidence);
    const base = e == null ? ca : 0.55 * ca + 0.45 * (35 + 0.65 * e);
    attrs[d.key] = toScale(base);
  }
  // experience drives awareness; personality-like mental traits are simulated
  attrs.awr = clamp(Math.round(attrs.awr + Math.min(4, sp.exp * 0.5) - 1), 1, 20);
  attrs.ldr = clamp(Math.round(rng.normal(8 + Math.min(6, sp.exp) * 0.6 + (ca - 55) / 12, 3)), 1, 20);
  attrs.wrk = clamp(Math.round(rng.normal(12, 3.5)), 1, 20);

  const c = sp.combine ?? {};
  const decline = Math.max(0, age - 28) * 0.4;
  const forty = c.forty ?? FORTY_MEAN[sp.group] + rng.normal(-(ca - 55) / 400, 0.08);
  attrs.spd = clamp(Math.round(20 - (forty - 4.28) * 14.5 - decline), 1, 20);
  const broad = c.broad_jump ?? null, vert = c.vertical ?? null;
  attrs.acc = clamp(Math.round(broad != null ? 4 + (broad - 96) * 0.44 - decline : attrs.spd + rng.normal(0, 1.2)), 1, 20);
  const cone = c.cone ?? (c.shuttle != null ? c.shuttle * 1.66 : null);
  attrs.agi = clamp(Math.round(cone != null ? 20 - (cone - 6.55) * 12.3 - decline : attrs.spd - 1 + rng.normal(0, 1.5)), 1, 20);
  const wt = sp.wt ?? 240;
  attrs.str = clamp(Math.round(c.bench != null ? 3 + c.bench * 0.38 + (wt - 200) / 30 : 4 + (wt - 180) / 13 + rng.normal(0, 1.5)), 1, 20);
  attrs.jmp = clamp(Math.round(vert != null ? 4 + (vert - 24) * 0.89 - decline / 2 : attrs.acc + rng.normal(-1, 1.5)), 1, 20);
  attrs.sta = clamp(Math.round(rng.normal(STAMINA_BASE[sp.group] ?? 12, 2) - Math.max(0, age - 30) * 0.5), 1, 20);
  attrs.fit = clamp(Math.round(rng.normal(12, 3) - Math.max(0, age - 30) * 0.6), 1, 20);

  const personality: Record<string, number> = {};
  for (const p of PERSONALITY) personality[p.key] = clamp(Math.round(rng.normal(11, 4)), 1, 20);
  personality.professionalism = clamp(Math.round((attrs.wrk + personality.professionalism) / 2), 1, 20);

  const vet = sp.exp >= 4;
  return {
    id: sp.id, name: sp.name, first: sp.first ?? sp.name.split(' ')[0], last: sp.last ?? sp.name.split(' ').slice(1).join(' '),
    team: sp.team, list: sp.status, group: sp.group, pos: sp.pos ?? sp.group, jersey: sp.jersey, birth: sp.birth, ht: sp.ht, wt: sp.wt,
    college: sp.college, exp: sp.exp, draft: sp.draft, headshot: sp.headshot,
    ca: round1(ca), pa: round1(pa), attrs, personality,
    basis: { rating: r?.overall ?? null, ratingSeason: r?.season ?? null, games: r?.games ?? null, apyPct, depthRank, draftValue, combine: !!sp.combine },
    contract: sp.contract, injury: null, irGames: 0, elevations: 0, elevated: false, waiver: null, ask: null, vet, history: [], lastTeam: sp.team ?? sp.last_team ?? null, lastSeason: sp.team ? undefined : sp.last_roster_season,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Star rating (0.5–5) relative to NFL quality. */
export function stars(ca: number): number { return clamp(Math.round(((ca - 35) / 12) * 2) / 2, 0.5, 5); }

export function attrDefsFor(group: PosGroup) {
  return { technical: TECHNICAL[group], mental: MENTAL, physical: PHYSICAL };
}

export { BUCKETS };
