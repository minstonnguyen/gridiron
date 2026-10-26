import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Star, X } from 'lucide-react';
import type { FranchiseState, Player } from '../types';
import { starRange } from '../fog';
import { ageOn } from '../attributes';
import { capHit, leagueYear } from '../cap';

export function Btn({ tone = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'primary' && 'bg-volt text-ink-950 hover:brightness-110',
        tone === 'danger' && 'border border-[#ff6b6b]/50 text-[#ffb3b3] hover:bg-[#ff6b6b]/10',
        tone === 'default' && 'border border-line bg-ink-700 text-fg hover:bg-ink-600',
        tone === 'ghost' && 'text-fg-muted hover:bg-white/5 hover:text-fg',
        className,
      )}
    />
  );
}

/** Star range with a fill bar (estimated by your staff — never the hidden truth). */
export function Stars({ range, label }: { range: [number, number]; label?: string }) {
  const [lo, hi] = range;
  const full = Math.floor(lo);
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${label ?? 'Rating'}: ${lo === hi ? lo : `${lo} to ${hi}`} stars (staff estimate)`}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={clsx('h-3.5 w-3.5', i < full ? 'fill-volt text-volt' : i < lo ? 'fill-volt/50 text-volt' : i < hi ? 'text-volt/70' : 'text-fg-dim/50')} />
        ))}
      </span>
      <span className="tabular text-xs text-fg-muted">{lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}–${hi.toFixed(1)}`}</span>
    </span>
  );
}

export const PlayerStars = ({ s, p, which }: { s: FranchiseState; p: Player; which: 'ca' | 'pa' }) => <Stars range={starRange(s, p, which)} label={which === 'ca' ? 'Current ability' : 'Potential'} />;

export function Attr({ range }: { range: [number, number] }) {
  const [lo, hi] = range;
  const mid = (lo + hi) / 2;
  const color = mid >= 15 ? 'text-volt' : mid >= 11 ? 'text-ice' : mid >= 7 ? 'text-fg' : 'text-[#ff9f8a]';
  return <span className={clsx('tabular font-display text-base font-bold', color)}>{lo === hi ? lo : `${lo}-${hi}`}</span>;
}

export const age = (p: Player, date: string) => ageOn(p.birth, date);
export const hit = (s: FranchiseState, p: Player) => capHit(p, leagueYear(s.date));
export const m = (x: number | null | undefined, d = 2) => (x == null ? '—' : `$${x.toFixed(d)}M`);

export const LIST_LABEL: Record<string, string> = {
  active: 'Active', ps: 'Practice squad', ps_intl: 'PS (Intl. Pathway)', ps_inj: 'PS injured', ir: 'Injured reserve', ir_return: 'IR (designated to return)',
  pup: 'PUP', nfi: 'NFI', fa: 'Free agent', waivers: 'On waivers', retired: 'Retired',
};

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ice' | 'volt' | 'red' | 'amber' }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 font-display text-[0.7rem] font-bold uppercase tracking-wider',
      tone === 'muted' && 'bg-ink-600 text-fg-muted', tone === 'ice' && 'bg-ice/15 text-ice', tone === 'volt' && 'bg-volt/15 text-volt',
      tone === 'red' && 'bg-[#ff6b6b]/15 text-[#ffb3b3]', tone === 'amber' && 'bg-[#ffb84d]/15 text-[#ffd08a]')}>{children}</span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-lg p-5 outline-none" style={{ background: '#0b1220' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="display text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-muted hover:bg-white/5"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PageTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>{kicker && <div className="kicker">{kicker}</div>}<h1 className="display text-3xl sm:text-4xl">{title}</h1></div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel p-6 text-center text-sm text-fg-muted">{children}</div>;
}
