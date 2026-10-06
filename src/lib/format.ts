import type { GameSummary, TeamRecord, Tier } from '@/types/api';

export const TIER_COLORS: Record<Tier, string> = {
  GENERATIONAL: '#ffd166',
  ELITE: '#c49bff',
  STAR: '#5ad8ff',
  'ABOVE AVERAGE': '#5cf2a0',
  AVERAGE: '#c7d0e0',
  'BELOW AVERAGE': '#ff9f5a',
  DEVELOPING: '#ff6b7a',
  'INSUFFICIENT DATA': '#5f6b84',
};

export function tierFor(score: number | null | undefined): Tier {
  if (score == null) return 'INSUFFICIENT DATA';
  if (score >= 95) return 'GENERATIONAL';
  if (score >= 90) return 'ELITE';
  if (score >= 85) return 'STAR';
  if (score >= 80) return 'ABOVE AVERAGE';
  if (score >= 70) return 'AVERAGE';
  if (score >= 60) return 'BELOW AVERAGE';
  return 'DEVELOPING';
}
export const tierColor = (score: number | null | undefined) => TIER_COLORS[tierFor(score)];

export const rint = (v: number | null | undefined) => (v == null ? null : Math.round(v));
export const fmt = (v: number | null | undefined, d = 0) =>
  v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const recordStr = (r: TeamRecord | null | undefined) => (r ? `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}` : '—');

export function kickoffLocal(iso: string | null, opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }) {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleTimeString('en-US', { ...opts, timeZoneName: 'short' });
}
export function dateLong(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
export function dateShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function statusLabel(g: GameSummary): string {
  switch (g.status) {
    case 'final': return g.overtime ? 'FINAL/OT' : 'FINAL';
    case 'in_progress': return 'KICKED OFF · NO LIVE FEED';
    case 'awaiting_result': return 'AWAITING FINAL SCORE';
    default: return kickoffLocal(g.kickoff).toUpperCase();
  }
}

export const weekLabel = (w: number, seasonType?: string, gameType?: string | null) => {
  if (seasonType === 'POST' || w > 18) {
    const m: Record<string, string> = { WC: 'WILD CARD', DIV: 'DIVISIONAL', CON: 'CONFERENCE', SB: 'SUPER BOWL' };
    return (gameType && m[gameType]) || `WEEK ${w}`;
  }
  return `WEEK ${w}`;
};

export function heightStr(inches: number | null) {
  return inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : '—';
}

/** Readable text color on top of a hex background. */
export function onColor(hex: string | null | undefined) {
  if (!hex) return '#fff';
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#06090f' : '#ffffff';
}

/** Some team primaries are near-black; lift them so glows/borders stay visible on the dark UI. */
export function vivid(primary: string | null | undefined, secondary?: string | null) {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  if (primary && lum(primary) > 45) return primary;
  if (secondary && lum(secondary) > 45) return secondary;
  return primary ? '#7f8fb0' : '#5ad8ff';
}

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as const;
export const POSITION_NAMES: Record<string, string> = {
  QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends', OL: 'Offensive Linemen', EDGE: 'Edge Rushers',
  DL: 'Interior Defensive Linemen', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters',
};
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
