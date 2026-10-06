import clsx from 'clsx';
import { useCountUp } from '@/hooks/ui';
import { TIER_COLORS, tierFor } from '@/lib/format';
import type { Confidence, PlayerStatus, Tier } from '@/types/api';

export function RatingNumber({ value, className = '', animate = true }: { value: number | null; className?: string; animate?: boolean }) {
  const shown = useCountUp(animate ? (value == null ? null : Math.round(value)) : null);
  const v = animate ? shown : value == null ? null : Math.round(value);
  const color = TIER_COLORS[tierFor(value)];
  return (
    <span className={clsx('display tabular', className)} style={{ color, textShadow: value != null && value >= 90 ? `0 0 18px ${color}66` : undefined }}>
      {value == null ? '—' : v}
    </span>
  );
}

export function RatingBadge({ value, size = 'md', tier }: { value: number | null; size?: 'sm' | 'md' | 'lg' | 'xl'; tier?: Tier }) {
  const t = tier ?? tierFor(value);
  const color = TIER_COLORS[t];
  const s = { sm: 'h-9 w-9 text-lg', md: 'h-12 w-12 text-2xl', lg: 'h-16 w-16 text-4xl', xl: 'h-24 w-24 text-6xl' }[size];
  return (
    <div
      className={clsx('relative grid place-items-center rounded-lg', s)}
      style={{ background: `linear-gradient(160deg, ${color}2e, #0a101c 70%)`, boxShadow: `inset 0 0 0 1.5px ${color}aa, 0 6px 18px -8px ${color}` }}
      aria-label={value == null ? 'Rating: insufficient data' : `GRIDIRON rating ${Math.round(value)}, ${t}`}
    >
      <RatingNumber value={value} className="leading-none" />
    </div>
  );
}

export function TierTag({ tier, className = '' }: { tier: Tier | null | undefined; className?: string }) {
  const t = tier ?? 'INSUFFICIENT DATA';
  return <span className={clsx('kicker !tracking-[0.18em]', className)} style={{ color: TIER_COLORS[t] }}>{t}</span>;
}

export function ConfidencePill({ c }: { c: Confidence | null | undefined }) {
  if (!c) return null;
  const col = c === 'HIGH' ? '#5cf2a0' : c === 'MEDIUM' ? '#ffd166' : '#ff9f5a';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-display text-[0.7rem] font-bold tracking-[0.16em]" style={{ borderColor: col + '66', color: col }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />CONF {c}
    </span>
  );
}

const STATUS_COL: Record<PlayerStatus['code'], string> = {
  HEALTHY: '#5cf2a0', QUESTIONABLE: '#ffd166', DOUBTFUL: '#ff9f5a', OUT: '#ff5d6c', INACTIVE: '#ff5d6c', RESERVE: '#ff5d6c', UNAVAILABLE: '#5f6b84',
};
export function StatusPill({ s, compact }: { s: PlayerStatus | null | undefined; compact?: boolean }) {
  if (!s) return null;
  const col = STATUS_COL[s.code];
  const text = compact ? ({ QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'OUT', INACTIVE: 'INA', RESERVE: 'RES', HEALTHY: '', UNAVAILABLE: '' } as Record<string, string>)[s.code] : s.label;
  if (compact && !text) return null;
  return (
    <span title={[s.label, s.injury, s.practice].filter(Boolean).join(' · ')} className="inline-flex items-center rounded px-1.5 py-0.5 font-display text-[0.68rem] font-bold tracking-[0.12em]" style={{ background: col + '22', color: col, boxShadow: `inset 0 0 0 1px ${col}55` }}>
      {text}
    </span>
  );
}

export function StatBar({ label, value, max = 100, sub }: { label: string; value: number | null; max?: number; sub?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const color = TIER_COLORS[tierFor(value == null ? null : value)];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="kicker truncate">{label}</span>
      <span className="display tabular text-lg" style={{ color: value == null ? '#5f6b84' : color }}>{value == null ? '—' : Math.round(value)}</span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-ink-600" role="meter" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}55, ${color})` }} />
      </div>
      {sub && <span className="col-span-2 text-[11px] text-fg-dim">{sub}</span>}
    </div>
  );
}
