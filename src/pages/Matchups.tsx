import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { client } from '@/api/client';
import { useSeasonGames } from '@/hooks/useData';
import { useSeason } from '@/hooks/useSeason';
import { TeamLogo } from '@/components/Img';
import { RatingNumber } from '@/components/Rating';
import { EmptyState, ErrorState, PageLoading } from '@/components/States';
import { dateShort, statusLabel, vivid, weekLabel } from '@/lib/format';

export default function Matchups() {
  const { season, week, setWeek, meta } = useSeason();
  const games = useSeasonGames(season);
  const list = (games.data ?? []).filter((g) => g.week === week);
  const ms = useQueries({ queries: list.map((g) => ({ queryKey: ['matchup', g.id], queryFn: () => client.matchup(g.id), staleTime: 5 * 60_000 })) });
  const weeks = season != null ? meta?.weeksBySeason[season] ?? [] : [];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">{season} · {week ? weekLabel(week, week > 18 ? 'POST' : 'REG') : ''}</div>
          <h1 className="display text-5xl">Matchups</h1>
          <p className="mt-1 text-sm text-fg-muted">Analytics matchup edges from the GRIDIRON ratings of each team's projected starters. Not predictions.</p>
        </div>
        <div className="scrollbar-thin flex max-w-full gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Week">
          {weeks.map((w) => (
            <button key={w} role="tab" aria-selected={w === week} onClick={() => setWeek(w)} className={`shrink-0 rounded-md px-2.5 py-1.5 font-display text-sm font-bold ${w === week ? 'bg-ice text-ink-950' : 'text-fg-muted hover:bg-white/5'}`}>{w > 18 ? weekLabel(w, 'POST').split(' ')[0] : w}</button>
          ))}
        </div>
      </header>
      {games.isLoading ? <PageLoading /> : games.isError ? <ErrorState error={games.error} onRetry={() => games.refetch()} /> : !list.length ? <EmptyState title="NO GAMES THIS WEEK" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((g, i) => {
            const m = ms[i]?.data;
            const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
            const top = m?.units.filter((u) => u.edge === 'away' || u.edge === 'home').sort((a, b) => Math.abs(b.margin ?? 0) - Math.abs(a.margin ?? 0)).slice(0, 3) ?? [];
            return (
              <Link key={g.id} to={`/game/${g.id}`} className="panel group block overflow-hidden transition hover:-translate-y-0.5 hover:border-white/20">
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${ac} 0 50%, ${hc} 50% 100%)` }} />
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
                  <div className="flex items-center gap-3"><TeamLogo src={g.away.logo} abbr={g.away.abbr} size={48} /><div><div className="display text-2xl">{g.away.abbr}</div>{m && <RatingNumber value={m.overall.away} className="text-xl" animate={false} />}</div></div>
                  <div className="text-center"><div className="kicker">{dateShort(g.date)}</div><div className="kicker !text-[0.62rem] text-ice">{statusLabel(g)}</div>{g.status === 'final' && <div className="display tabular text-2xl">{g.away.score}–{g.home.score}</div>}</div>
                  <div className="flex items-center justify-end gap-3 text-right"><div><div className="display text-2xl">{g.home.abbr}</div>{m && <RatingNumber value={m.overall.home} className="text-xl" animate={false} />}</div><TeamLogo src={g.home.logo} abbr={g.home.abbr} size={48} /></div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-white/5 px-4 py-2.5">
                  {ms[i]?.isLoading && <span className="skeleton h-5 w-48" />}
                  {ms[i]?.isError && <span className="kicker">EDGES DATA UNAVAILABLE</span>}
                  {top.map((u) => (
                    <span key={u.unit} className="rounded-md bg-ink-700 px-2 py-1 font-display text-xs font-bold tracking-wider">
                      {u.unit}: <span style={{ color: u.edge === 'away' ? ac : hc }}>{u.edge === 'away' ? g.away.abbr : g.home.abbr} +{Math.abs(u.margin ?? 0).toFixed(1)}</span>
                    </span>
                  ))}
                  {m && !top.length && <span className="kicker">NO CLEAR UNIT EDGES</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
