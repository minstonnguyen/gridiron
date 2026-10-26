import type { FranchiseState, Player } from './types';
import { hashUnit } from './rng';
import { stars } from './attributes';
import { staffBy } from './staff';

/**
 * Fog of war. You never see a player's true attributes — only your staff's estimate, shown as a range.
 * Width shrinks with knowledge (0–100): your own players are known well by your coaches; other teams' players are
 * known from public tape and grow better known when you face them or scout them. Your Director of Pro Scouting's
 * Judging Ability narrows ranges and reduces systematic bias. Estimates are stable (bias is a fixed per-player hash).
 */
export function knowledgeOf(state: FranchiseState, p: Player): number {
  if (p.team === state.userTeam) return Math.max(state.knowledge[p.id] ?? 0, 85);
  return state.knowledge[p.id] ?? 30;
}

function judging(state: FranchiseState) {
  const s = staffBy(state, state.userTeam, 'Director of Pro Scouting');
  return s?.attrs.jab ?? 10;
}

export function estimate(state: FranchiseState, p: Player, trueVal: number, key: string, scaleMax = 20, widthMult = 1): [number, number] {
  const k = knowledgeOf(state, p);
  const j = judging(state);
  const unc = ((100 - k) / 100) * (1.25 - j / 40) * widthMult; // 0 … ~1.2
  const half = unc * (scaleMax / 20) * 5;
  const bias = hashUnit(`${state.meta.id}:${p.id}:${key}`) * half * 0.8;
  const c = trueVal + bias;
  const lo = Math.max(1, Math.round(c - half)), hi = Math.min(scaleMax, Math.round(c + half));
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

export function starRange(state: FranchiseState, p: Player, which: 'ca' | 'pa'): [number, number] {
  const k = knowledgeOf(state, p);
  const j = judging(state);
  const v = which === 'ca' ? p.ca : p.pa;
  const unc = ((100 - k) / 100) * (1.25 - j / 40) * (which === 'pa' ? 1.8 : 1);
  const half = unc * 14; // CA points
  const bias = hashUnit(`${state.meta.id}:${p.id}:${which}`) * half * 0.8;
  const lo = stars(v + bias - half), hi = stars(v + bias + half);
  return [lo, Math.max(lo, hi)];
}

export function fmtRange([a, b]: [number, number]) { return a === b ? `${a}` : `${a}–${b}`; }
