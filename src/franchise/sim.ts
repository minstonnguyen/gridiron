import type { Calibration, FranchiseState, Game, Player, PosGroup } from './types';
import { Rng, normCdf } from './rng';
import { STARTERS } from './attributes';

/**
 * PROVISIONAL results model (Phase 1). The full play-by-play match engine arrives in Phase 3; until then games are
 * resolved from team strength and the real NFL score distribution, so seasons can be played and standings are
 * believable. Every simulated result is labelled "SIM" in the UI. Calibration targets come from real 2016–2025
 * regular-season games (calibration.json → scoring) and are checked by scripts/franchise/calibrate.ts.
 */

export const GROUP_WEIGHT: Record<PosGroup, number> = {
  QB: 0.24, OT: 0.045, IOL: 0.03, WR: 0.035, TE: 0.035, RB: 0.03,
  EDGE: 0.05, IDL: 0.035, LB: 0.025, CB: 0.035, S: 0.025, K: 0.015, P: 0.008, LS: 0.002,
};

export function lineup(state: FranchiseState, team: string): Record<PosGroup, Player[]> {
  const order = state.depth[team] ?? {};
  const out = {} as Record<PosGroup, Player[]>;
  const inactive = new Set(state.inactives[team] ?? []);
  for (const g of Object.keys(STARTERS) as PosGroup[]) {
    const ids = order[g] ?? [];
    out[g] = ids.map((id) => state.players[id]).filter((p) => p && p.team === team && (p.list === 'active' || p.elevated) && !p.injury && !inactive.has(p.id));
  }
  return out;
}

/** Roster-based strength on the CA (0–100) scale: starters weighted by positional importance, plus rotation depth. */
export function rosterStrength(state: FranchiseState, team: string): number {
  const lu = lineup(state, team);
  let s = 0, w = 0;
  for (const g of Object.keys(STARTERS) as PosGroup[]) {
    const n = STARTERS[g];
    const players = lu[g];
    for (let i = 0; i < n; i++) {
      const ca = players[i]?.ca ?? 25; // an empty slot is filled by a replacement-level body
      s += ca * GROUP_WEIGHT[g]; w += GROUP_WEIGHT[g];
    }
    if (['EDGE', 'IDL', 'WR', 'CB'].includes(g)) {
      const ca = players[n]?.ca ?? 30;
      s += ca * GROUP_WEIGHT[g] * 0.35; w += GROUP_WEIGHT[g] * 0.35;
    }
  }
  return s / w;
}

export interface StrengthTable { mean: number; sd: number }
export function strengthTable(state: FranchiseState): StrengthTable {
  const xs = state.teams.map((t) => rosterStrength(state, t.abbr));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return { mean, sd };
}

/** Composite index in SD units: roster quality blended with the team's real point-differential prior (scheme/coaching). */
export function teamIndex(state: FranchiseState, team: string, tbl: StrengthTable): number {
  const z = (rosterStrength(state, team) - tbl.mean) / tbl.sd;
  const prior = state.teams.find((t) => t.abbr === team)?.prior ?? 0;
  return 0.55 * z + 0.45 * prior;
}

export const MODEL = { marginPerSd: 0.68, homeEdge: 0.15, idxDiffVar: 0.9 }; // tuned by scripts/franchise/calibrate.ts

/**
 * Results model (provisional until the Phase 3 play-by-play engine).
 * A latent home-strength draw z ~ N(d, 1) is mapped to a quantile of the empirical distribution of real signed
 * final scores (every 2016–2025 regular-season final counted once from each side). The real joint scores keep the
 * NFL's key-number margins (3, 7, 10...), totals, ties and overtime frequencies; team strength shifts which part of
 * that distribution a game lands in.
 */
type Pair = { m: number; hi: number; lo: number; ot: boolean };
let pairCache: { key: string; list: Pair[] } | null = null;
function pairs(cal: Calibration): Pair[] {
  const key = cal.generated_at;
  if (!pairCache || pairCache.key !== key) {
    const list: Pair[] = [];
    for (const [k, n] of Object.entries(cal.scoring.score_pairs ?? {})) {
      const [hi, lo, ot] = k.split('-').map(Number);
      for (let i = 0; i < n; i++) { list.push({ m: hi - lo, hi, lo, ot: ot === 1 }); list.push({ m: -(hi - lo), hi, lo, ot: ot === 1 }); }
    }
    // order by signed margin; within a margin interleave by a fixed hash so quantile picks vary in total
    list.sort((a, b) => a.m - b.m || ((a.hi * 7919 + a.lo * 104729) % 997) - ((b.hi * 7919 + b.lo * 104729) % 997));
    pairCache = { key, list };
  }
  return pairCache.list;
}

export function simulateScore(rng: Rng, cal: Calibration, idxHome: number, idxAway: number, neutral: boolean, playoff: boolean) {
  const d = MODEL.marginPerSd * (idxHome - idxAway) + (neutral ? 0 : MODEL.homeEdge);
  const list = pairs(cal);
  const u = normCdf(rng.normal(d, 1) / Math.sqrt(1 + MODEL.marginPerSd ** 2 * MODEL.idxDiffVar) /* keeps the marginal margin distribution equal to the real one */);
  // jitter inside the chosen margin band so totals vary
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(u * list.length)));
  let pick = list[idx];
  const band = list.filter((x) => x.m === pick.m);
  pick = band[Math.floor(rng.next() * band.length)];
  let home = pick.m >= 0 ? pick.hi : pick.lo, away = pick.m >= 0 ? pick.lo : pick.hi;
  let ot = pick.ot;
  if (home === away && playoff) {
    // playoff games cannot end tied
    ot = true;
    if (rng.next() < normCdf(d)) home += rng.next() < 0.62 ? 3 : 6; else away += rng.next() < 0.62 ? 3 : 6;
  }
  return { home, away, ot };
}

/** Injury draw for one player-game, calibrated to real 2016–2025 injury episodes per available player-game. */
export function rollInjury(rng: Rng, cal: Calibration, p: Player, starter: boolean): { type: string; games: number } | null {
  const g = cal.injuries.by_group[p.group] ?? cal.injuries.by_group.LB;
  if (!g) return null;
  const prone = 0.7 + ((p.personality.injury_prone ?? 10) / 20) * 0.6;
  const fit = 1.15 - ((p.attrs.fit ?? 10) / 20) * 0.3;
  const prob = g.rate_per_game * (starter ? 1.45 : 0.55) * prone * fit;
  if (rng.next() >= prob) return null;
  const games = Number(rng.weighted(Object.entries(g.duration_hist).map(([k, v]) => [k, v] as [string, number])));
  const types = cal.injury_types[p.group] ?? cal.injury_types.LB ?? { Knee: 1 };
  const type = rng.weighted(Object.entries(types) as [string, number][]);
  return { type, games };
}

export function isPlayoff(g: Game) { return g.type !== 'REG'; }
