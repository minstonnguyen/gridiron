import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import clsx from 'clsx';
import { Headshot } from '@/components/Img';
import { ConfidencePill, RatingBadge, RatingNumber, StatBar, StatusPill, TierTag } from '@/components/Rating';
import { useCanHover } from '@/hooks/ui';
import { ordinal, tierColor } from '@/lib/format';
import type { PlayerCardData } from '@/types/api';

export function teamStyle(color: string | null | undefined): CSSProperties {
  return { ['--team' as string]: color ?? '#5ad8ff' } as CSSProperties;
}

/** Detailed scouting panel shown in the desktop hover popover and the mobile bottom sheet. */
export function PlayerDetail({ p, teamColor }: { p: PlayerCardData; teamColor?: string | null }) {
  const r = p.rating;
  return (
    <div className="space-y-3" style={teamStyle(teamColor)}>
      <div className="flex gap-3">
        <Headshot src={p.headshot} alt={p.name} className="h-20 w-20 shrink-0 rounded-lg bg-ink-700" />
        <div className="min-w-0 flex-1">
          <div className="kicker">#{p.jersey ?? '—'} · {p.position}{p.ratingPosition && p.ratingPosition !== p.position ? ` (${p.ratingPosition})` : ''} · {p.team}</div>
          <div className="display truncate text-2xl">{p.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill s={p.status} />
            {p.starterLabel === 'PROJECTED STARTER' && <span className="kicker !text-[0.62rem] text-ice">PROJECTED STARTER</span>}
          </div>
        </div>
        <div className="text-right">
          <RatingNumber value={r?.overall ?? null} className="block text-5xl leading-none" />
          <TierTag tier={r?.tier} className="!text-[0.62rem]" />
        </div>
      </div>
      {r ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span>Position rank: <b className="text-fg">{r.positionRank ? `#${r.positionRank} of ${r.positionCount}` : '—'}</b></span>
          <span className="text-right">{r.positionScore != null ? `${ordinal(Math.round(r.positionScore))} pct among ${r.position}s` : ''}</span>
          <span>{r.season} rating{r.fromPriorSeason ? ' (prior season)' : ''}</span>
          <span className="text-right"><ConfidencePill c={r.confidence} /></span>
        </div>
      ) : (
        <div className="kicker">INSUFFICIENT DATA FOR A RATING</div>
      )}
      {p.season && (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-ink-800/80 p-2 text-center">
          {[['GAMES', p.season.games], ['STARTS', p.season.starts], ['SNAPS', p.season.snaps]].map(([k, v]) => (
            <div key={k as string}><div className="kicker !text-[0.6rem]">{k}</div><div className="display tabular text-lg">{v ?? '—'}</div></div>
          ))}
        </div>
      )}
      {p.season?.key?.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {p.season.key.map((k) => (
            <div key={k.label}><div className="kicker !text-[0.6rem]">{k.label}</div><div className="display tabular text-base">{k.value}</div></div>
          ))}
          <div className="kicker basis-full !text-[0.58rem] text-fg-dim">{p.season.season} regular season</div>
        </div>
      ) : null}
      {r && r.overall != null && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <StatBar label="Efficiency" value={r.efficiency} />
          <StatBar label="Advanced impact" value={r.advanced} />
          <StatBar label="Production" value={r.production} />
          <StatBar label="Consistency" value={r.consistency} />
          <StatBar label="Recent form" value={r.recentForm} />
        </div>
      )}
      <RecentForm p={p} />
      <div className="grid grid-cols-2 gap-2 text-xs text-fg-muted">
        <div><span className="kicker !text-[0.6rem] block">College</span>{p.college ?? '—'}</div>
        <div><span className="kicker !text-[0.6rem] block">Experience</span>{p.experience != null ? `${p.experience} yr` : '—'}</div>
        <div className="col-span-2"><span className="kicker !text-[0.6rem] block">Draft</span>{p.draft ?? '—'}</div>
      </div>
      {p.bio && <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">{p.bio}</p>}
      {p.status.injury && <p className="text-xs text-[#ffd166]">Injury report: {p.status.injury}{p.status.practice ? ` — ${p.status.practice}` : ''}</p>}
      {p.gameSnapPct != null && <p className="kicker text-volt">PLAYED {Math.round(p.gameSnapPct * 100)}% OF UNIT SNAPS THIS GAME</p>}
    </div>
  );
}

export function RecentForm({ p }: { p: PlayerCardData }) {
  if (!p.recent.length) return <div className="kicker !text-[0.6rem]">RECENT FORM · DATA UNAVAILABLE</div>;
  return (
    <div>
      <div className="kicker !text-[0.6rem] mb-1">RECENT FORM · GAME GRADES (LAST {p.recent.length})</div>
      <div className="flex items-end gap-1.5" aria-label="Recent game grades">
        {p.recent.map((g) => (
          <div key={`${g.week}-${g.opp}`} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="w-full rounded-sm" style={{ height: `${Math.max(6, ((g.score ?? 40) - 35) * 0.6)}px`, background: tierColor(g.score) }} title={`Wk ${g.week} vs ${g.opp}: ${g.score}`} />
            <span className="tabular text-[10px] text-fg-dim">{g.opp ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Desktop: hover/focus popover. Touch: tap opens a bottom sheet. Click/Enter on desktop opens the profile. */
export function PlayerHover({ p, teamColor, children, className = '' }: { p: PlayerCardData; teamColor?: string | null; children: ReactNode; className?: string }) {
  const canHover = useCanHover();
  const ref = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const timer = useRef<number>();
  const show = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120); }, []);
  const hide = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 80); }, []);
  return (
    <>
      <Link
        ref={ref}
        to={`/player/${p.id}`}
        className={clsx('block focus:outline-none', className)}
        onMouseEnter={canHover ? show : undefined}
        onMouseLeave={canHover ? hide : undefined}
        onFocus={canHover ? show : undefined}
        onBlur={canHover ? hide : undefined}
        onClick={(e) => { if (!canHover) { e.preventDefault(); setSheet(true); } }}
        aria-label={`${p.name}, ${p.position}, rating ${p.rating?.overall != null ? Math.round(p.rating.overall) : 'insufficient data'}`}
      >
        {children}
      </Link>
      {open && canHover && ref.current && <Popover anchor={ref.current} onEnter={show} onLeave={hide}><PlayerDetail p={p} teamColor={teamColor} /></Popover>}
      {sheet && <BottomSheet onClose={() => setSheet(false)} p={p} teamColor={teamColor} />}
    </>
  );
}

function Popover({ anchor, children, onEnter, onLeave }: { anchor: HTMLElement; children: ReactNode; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 380, h = el?.offsetHeight ?? 480;
    let left = a.right + 12;
    if (left + w > window.innerWidth - 8) left = a.left - w - 12;
    if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    let top = a.top + a.height / 2 - h / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    setPos({ left, top });
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="panel fixed z-[80] w-[380px] animate-rise p-4 shadow-2xl"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, background: 'linear-gradient(180deg, rgba(18,27,48,0.97), rgba(7,11,20,0.98))' }}
    >
      {children}
    </div>,
    document.body,
  );
}

function BottomSheet({ p, teamColor, onClose }: { p: PlayerCardData; teamColor?: string | null; onClose: () => void }) {
  const nav = useNavigate();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${p.name} details`}>
      <div className="panel max-h-[85vh] w-full animate-rise overflow-y-auto rounded-b-none p-4 pb-8" onClick={(e) => e.stopPropagation()} style={{ background: '#0b1220' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-500" />
        <div className="mb-2 flex justify-end">
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/5" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <PlayerDetail p={p} teamColor={teamColor} />
        <button onClick={() => nav(`/player/${p.id}`)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-ice py-3 font-display text-lg font-bold tracking-wider text-ink-950">
          OPEN FULL PROFILE <ArrowUpRight className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Large scouting card (lists, watch list, rosters). */
export function PlayerCard({ p, teamColor, size = 'md' }: { p: PlayerCardData; teamColor?: string | null; size?: 'md' | 'sm' }) {
  const r = p.rating;
  return (
    <PlayerHover p={p} teamColor={teamColor}>
      <article className="pcard group h-full" style={teamStyle(teamColor)}>
        <div className={clsx('relative', size === 'md' ? 'h-36' : 'h-24')}>
          <div className="absolute inset-0 stripe opacity-60" />
          <Headshot src={p.headshot} alt="" className="absolute inset-x-0 bottom-0 mx-auto h-full w-[78%]" imgClassName="object-contain object-bottom" />
          <div className="absolute left-2 top-2 display text-3xl text-white/80 [text-shadow:0_2px_8px_rgba(0,0,0,.6)]">#{p.jersey ?? '—'}</div>
          <div className="absolute right-2 top-2"><StatusPill s={p.status} compact /></div>
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-white/5 bg-ink-900/70 px-3 py-2">
          <div className="min-w-0">
            <div className="kicker !text-[0.62rem]">{p.position} · {p.team}</div>
            <div className="display truncate text-lg leading-tight">{p.name}</div>
          </div>
          <div className="text-right">
            <RatingNumber value={r?.overall ?? null} className="block text-3xl leading-none" />
            <TierTag tier={r?.tier} className="!text-[0.55rem]" />
          </div>
        </div>
      </article>
    </PlayerHover>
  );
}

/** Compact field node used on the formation diagram. */
export function PlayerNode({ p, label, teamColor }: { p: PlayerCardData | null; label: string; teamColor?: string | null }) {
  if (!p)
    return (
      <div className="w-[76px] rounded-lg border border-dashed border-white/20 bg-black/30 p-1.5 text-center sm:w-[92px]">
        <div className="kicker !text-[0.6rem]">{label}</div>
        <div className="text-[10px] text-fg-dim">DATA UNAVAILABLE</div>
      </div>
    );
  const r = p.rating;
  const out = ['OUT', 'INACTIVE', 'RESERVE'].includes(p.status.code);
  return (
    <PlayerHover p={p} teamColor={teamColor}>
      <div className={clsx('pcard w-[76px] sm:w-[92px]', out && 'opacity-60 grayscale')} style={teamStyle(teamColor)}>
        <div className="relative h-11 sm:h-14">
          <Headshot src={p.headshot} alt="" className="absolute inset-0 mx-auto w-[80%]" imgClassName="object-contain object-bottom" />
          <span className="absolute left-1 top-0.5 display text-sm text-white/85">{p.jersey ?? ''}</span>
          <span className="absolute right-1 top-0.5"><StatusPill s={p.status} compact /></span>
        </div>
        <div className="bg-ink-950/80 px-1 pb-1 pt-0.5 text-center">
          <div className="truncate font-display text-[11px] font-bold uppercase leading-tight sm:text-xs">{p.lastName ?? p.name}</div>
          <div className="flex items-center justify-center gap-1">
            <span className="kicker !text-[0.55rem] !tracking-[0.1em]">{label}</span>
            <RatingNumber value={r?.overall ?? null} className="text-lg leading-none sm:text-xl" />
          </div>
        </div>
      </div>
    </PlayerHover>
  );
}

export function PlayerRow({ p, teamColor, right }: { p: PlayerCardData; teamColor?: string | null; right?: ReactNode }) {
  return (
    <PlayerHover p={p} teamColor={teamColor}>
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]">
        <Headshot src={p.headshot} alt="" className="h-9 w-9 shrink-0 rounded-full bg-ink-700" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.name}</div>
          <div className="kicker !text-[0.6rem]">{p.position} · #{p.jersey ?? '—'}{p.status.injury ? ` · ${p.status.injury}` : ''}</div>
        </div>
        {right}
        <RatingBadge value={p.rating?.overall ?? null} size="sm" />
      </div>
    </PlayerHover>
  );
}
