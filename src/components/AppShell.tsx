import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, Menu, Search, Shield, Swords, Trophy, Users, X } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Wordmark } from './Logo';
import { Headshot, TeamLogo } from './Img';
import { RatingNumber } from './Rating';
import { client, DATA_MODE } from '@/api/client';
import { useSeason } from '@/hooks/useSeason';
import { statusLabel, weekLabel } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Home', icon: Trophy, end: true },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/matchups', label: 'Matchups', icon: Swords },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/teams', label: 'Teams', icon: Shield },
];

function Selectors() {
  const { season, week, setSeason, setWeek, meta } = useSeason();
  if (!meta || season == null) return <div className="skeleton h-8 w-40" />;
  const weeks = meta.weeksBySeason[season] ?? [];
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="season-sel">Season</label>
      <select id="season-sel" value={season} onChange={(e) => setSeason(Number(e.target.value))} className="rounded-md border border-line bg-ink-800 px-2 py-1.5 font-display text-sm font-bold tracking-wider">
        {meta.seasons.map((s) => <option key={s} value={s}>{s} SEASON</option>)}
      </select>
      <label className="sr-only" htmlFor="week-sel">Week</label>
      <select id="week-sel" value={week} onChange={(e) => setWeek(Number(e.target.value))} className="rounded-md border border-line bg-ink-800 px-2 py-1.5 font-display text-sm font-bold tracking-wider">
        {weeks.map((w) => <option key={w} value={w}>{weekLabel(w, w > 18 ? 'POST' : 'REG')}</option>)}
      </select>
    </div>
  );
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { meta } = useSeason();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 160); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', debounced], queryFn: () => client.search(debounced, meta?.currentSeason ?? new Date().getFullYear()),
    enabled: open && debounced.trim().length >= 2, staleTime: 60_000,
  });
  const items = useMemo(() => [
    ...(data?.players ?? []).map((p) => ({ key: `p${p.id}`, to: `/player/${p.id}`, kind: 'PLAYER', node: (
      <><Headshot src={p.headshot} alt="" className="h-9 w-9 shrink-0 rounded-full bg-ink-700" />
        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{p.name}</div><div className="kicker !text-[0.6rem]">{p.ratingPosition ?? p.position} · {p.team ?? 'FA'}</div></div>
        <RatingNumber value={p.overall} className="text-2xl" animate={false} /></>) })),
    ...(data?.teams ?? []).map((t) => ({ key: `t${t.abbr}`, to: `/team/${t.abbr}`, kind: 'TEAM', node: (
      <><TeamLogo src={t.logo} abbr={t.abbr} size={34} /><div className="flex-1"><div className="font-semibold">{t.name}</div><div className="kicker !text-[0.6rem]">{t.division}</div></div></>) })),
    ...(data?.games ?? []).map((g) => ({ key: `g${g.id}`, to: `/game/${g.id}`, kind: 'GAME', node: (
      <><div className="flex -space-x-2"><TeamLogo src={g.away.logo} abbr={g.away.abbr} size={28} /><TeamLogo src={g.home.logo} abbr={g.home.abbr} size={28} /></div>
        <div className="flex-1"><div className="font-semibold">{g.away.abbr} @ {g.home.abbr}</div><div className="kicker !text-[0.6rem]">{weekLabel(g.week, g.seasonType, g.gameType)} · {g.date} · {statusLabel(g)}</div></div></>) })),
  ], [data]);
  if (!open) return null;
  const go = (to: string) => { onClose(); nav(to); };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-3 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search players, teams and games" className="panel w-full max-w-xl overflow-hidden" style={{ background: '#0b1220' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 text-fg-muted" aria-hidden="true" />
          <input
            ref={input} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && items[idx]) go(items[idx].to);
            }}
            placeholder="Search players, teams, games…" aria-label="Search" role="combobox" aria-expanded={items.length > 0} aria-controls="search-results"
            aria-activedescendant={items[idx] ? `sr-${items[idx].key}` : undefined}
            className="h-14 flex-1 bg-transparent text-lg outline-none placeholder:text-fg-dim"
          />
          <kbd className="kicker rounded border border-line px-1.5">ESC</kbd>
        </div>
        <ul id="search-results" role="listbox" className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          {debounced.length < 2 && <li className="px-3 py-6 text-center text-sm text-fg-dim">Type at least 2 characters. Use ↑ ↓ and Enter.</li>}
          {isError && <li className="px-3 py-6 text-center text-sm text-[#ff9f5a]">Search is unavailable right now.</li>}
          {debounced.length >= 2 && !isFetching && !items.length && !isError && <li className="px-3 py-6 text-center text-sm text-fg-dim">No matches for “{debounced}”.</li>}
          {items.map((it, i) => (
            <li key={it.key} id={`sr-${it.key}`} role="option" aria-selected={i === idx}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(it.to)} className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === idx ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')}>
                <span className="kicker w-12 shrink-0 !text-[0.55rem]">{it.kind}</span>{it.node}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded focus:bg-ice focus:px-3 focus:py-2 focus:text-ink-950">Skip to content</a>
      <header className="sticky top-0 z-50 border-b border-line bg-ink-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
          <Link to="/" className="shrink-0"><Wordmark /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx('relative rounded-md px-3 py-2 font-display text-[0.95rem] font-bold uppercase tracking-[0.14em] transition', isActive ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                {({ isActive }) => <>{n.label}{isActive && <span className="absolute inset-x-3 -bottom-[13px] h-[2px] bg-ice shadow-[0_0_12px_#5ad8ff]" />}</>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block"><Selectors /></div>
            <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-md border border-line bg-ink-800 px-3 py-1.5 text-sm text-fg-muted hover:text-fg" aria-label="Open search (Ctrl+K)">
              <Search className="h-4 w-4" /><span className="hidden sm:inline">Search</span><kbd className="kicker hidden !text-[0.6rem] sm:inline">⌘K</kbd>
            </button>
            <button className="rounded-md p-2 lg:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {menu && (
          <div className="border-t border-line px-4 py-3 lg:hidden">
            <nav aria-label="Mobile" className="grid grid-cols-2 gap-2">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx('flex items-center gap-2 rounded-md border border-line px-3 py-2 font-display font-bold uppercase tracking-wider', isActive ? 'bg-white/5 text-fg' : 'text-fg-muted')}>
                  <n.icon className="h-4 w-4" />{n.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 md:hidden"><Selectors /></div>
          </div>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-fg-dim lg:px-6">
          <span>GRIDIRON · Data from <a className="underline hover:text-fg" href="https://github.com/nflverse" target="_blank" rel="noreferrer">nflverse</a>. Not affiliated with the NFL, EA Sports, PFF or ESPN. {DATA_MODE === 'static' ? 'Static database export.' : ''}</span>
          <span className="flex gap-4"><Link to="/data-sources" className="hover:text-fg">Data sources & methodology</Link><Link to="/admin/data" className="hover:text-fg">Data health</Link></span>
        </div>
      </footer>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
