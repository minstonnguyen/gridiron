import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import clsx from 'clsx';
import { client } from '@/api/client';
import { usePlayers, useTeams } from '@/hooks/useData';
import { useSeason } from '@/hooks/useSeason';
import { PlayerListRow } from '@/features/players/PlayerListRow';
import { Headshot } from '@/components/Img';
import { RatingNumber } from '@/components/Rating';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { POSITIONS, POSITION_NAMES } from '@/lib/format';

const PAGE = 25;

function Autocomplete() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { meta } = useSeason();
  useEffect(() => { const t = setTimeout(() => setDq(q), 150); return () => clearTimeout(t); }, [q]);
  const { data } = useQuery({ queryKey: ['search', dq], queryFn: () => client.search(dq, meta?.currentSeason ?? 0), enabled: dq.trim().length >= 2 });
  const items = data?.players ?? [];
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-dim" />
      <input
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setI(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          if (e.key === 'Enter' && items[i]) nav(`/player/${items[i].id}`);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Find any player by name…" aria-label="Find a player" role="combobox" aria-expanded={open && items.length > 0} aria-controls="player-ac"
        className="w-full rounded-lg border border-line bg-ink-800 py-2.5 pl-9 pr-3 outline-none placeholder:text-fg-dim focus:border-ice/60"
      />
      {open && items.length > 0 && (
        <ul id="player-ac" role="listbox" className="panel absolute z-30 mt-1 w-full p-1" style={{ background: '#0b1220' }}>
          {items.map((p, k) => (
            <li key={p.id} role="option" aria-selected={k === i}>
              <button onMouseDown={() => nav(`/player/${p.id}`)} onMouseEnter={() => setI(k)} className={clsx('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left', k === i && 'bg-white/[0.07]')}>
                <Headshot src={p.headshot} alt="" className="h-8 w-8 rounded-full bg-ink-700" />
                <span className="flex-1"><span className="block text-sm font-semibold">{p.name}</span><span className="kicker !text-[0.6rem]">{p.ratingPosition ?? p.position} · {p.team ?? 'FA'}</span></span>
                <RatingNumber value={p.overall} className="text-xl" animate={false} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Players() {
  const { season, meta, setSeason } = useSeason();
  const [pos, setPos] = useState<string>('QB');
  const [team, setTeam] = useState('');
  const [page, setPage] = useState(1);
  const list = usePlayers(season, pos);
  const teams = useTeams();
  useEffect(() => setPage(1), [pos, team, season]);
  const items = useMemo(() => (list.data?.items ?? []).filter((p) => !team || p.team === team), [list.data, team]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const shown = items.slice((page - 1) * PAGE, page * PAGE);
  const sel = 'rounded-md border border-line bg-ink-800 px-3 py-2 font-display text-sm font-bold tracking-wider';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">{season} · GRIDIRON Analytics Rating</div>
          <h1 className="display text-5xl">Players</h1>
        </div>
        <Autocomplete />
      </header>
      <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Position">
        {['ALL', ...POSITIONS].map((p) => (
          <button key={p} role="tab" aria-selected={p === pos} onClick={() => setPos(p)} className={clsx('shrink-0 rounded-md px-3 py-1.5 font-display font-bold tracking-wider', p === pos ? 'bg-ice text-ink-950' : 'text-fg-muted hover:bg-white/5')}>{p}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Season" className={sel} value={season} onChange={(e) => setSeason(Number(e.target.value))}>{meta?.seasons.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select aria-label="Team" className={sel} value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">ALL TEAMS</option>{teams.data?.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr}</option>)}
        </select>
        <span className="kicker">{pos === 'ALL' ? 'Top rated, all positions' : POSITION_NAMES[pos]} · {items.length} rated</span>
      </div>
      {list.isLoading ? <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
        : !items.length ? <EmptyState title="INSUFFICIENT DATA">No players with a rating for this filter. Early-season ratings need a minimum sample.</EmptyState>
        : (
          <>
            <div className="panel divide-y divide-white/5 p-2">
              {shown.map((p, k) => <PlayerListRow key={p.id} p={p} rank={(page - 1) * PAGE + k + 1} showConfidence />)}
            </div>
            <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
              <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="rounded-md border border-line p-2 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="kicker">PAGE {page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage((x) => x + 1)} className="rounded-md border border-line p-2 disabled:opacity-30" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </nav>
          </>
        )}
    </div>
  );
}
