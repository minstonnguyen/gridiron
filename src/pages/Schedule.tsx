import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useSeasonGames, useTeams } from '@/hooks/useData';
import { useSeason } from '@/hooks/useSeason';
import { GameCard } from '@/features/games/GameCard';
import { EmptyState, ErrorState, PageLoading } from '@/components/States';
import { dateLong, weekLabel } from '@/lib/format';

export default function Schedule() {
  const { season, week, setSeason, setWeek, meta } = useSeason();
  const [team, setTeam] = useState('');
  const [date, setDate] = useState('');
  const [allWeeks, setAllWeeks] = useState(false);
  const games = useSeasonGames(season);
  const teams = useTeams();

  const filtered = useMemo(() => {
    let g = games.data ?? [];
    if (date) g = g.filter((x) => x.date === date);
    else if (!allWeeks && !team) g = g.filter((x) => x.week === week);
    if (team) g = g.filter((x) => x.away.abbr === team || x.home.abbr === team);
    return g;
  }, [games.data, week, team, date, allWeeks]);

  const byDate = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const g of filtered) m.set(g.date, [...(m.get(g.date) ?? []), g]);
    return [...m.entries()];
  }, [filtered]);

  const weeks = season != null ? meta?.weeksBySeason[season] ?? [] : [];
  const sel = 'rounded-md border border-line bg-ink-800 px-3 py-2 font-display text-sm font-bold tracking-wider';
  return (
    <div className="space-y-6">
      <header>
        <div className="kicker">{season} NFL SEASON</div>
        <h1 className="display text-5xl">Schedule</h1>
      </header>
      <div className="panel flex flex-wrap items-end gap-3 p-3" role="search" aria-label="Filter schedule">
        <label className="flex flex-col gap-1"><span className="kicker !text-[0.6rem]">Season</span>
          <select className={sel} value={season} onChange={(e) => setSeason(Number(e.target.value))}>{meta?.seasons.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1"><span className="kicker !text-[0.6rem]">Week</span>
          <select className={sel} value={allWeeks ? 'all' : week} onChange={(e) => { if (e.target.value === 'all') setAllWeeks(true); else { setAllWeeks(false); setWeek(Number(e.target.value)); } setDate(''); }}>
            <option value="all">ALL WEEKS</option>
            {weeks.map((w) => <option key={w} value={w}>{weekLabel(w, w > 18 ? 'POST' : 'REG')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="kicker !text-[0.6rem]">Team</span>
          <select className={sel} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">ALL TEAMS</option>
            {teams.data?.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.nickname}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="kicker !text-[0.6rem]">Date</span>
          <input type="date" className={sel} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {(team || date || allWeeks) && <button className="kicker rounded-md px-3 py-2.5 hover:bg-white/5 hover:text-fg" onClick={() => { setTeam(''); setDate(''); setAllWeeks(false); }}>RESET</button>}
        <span className="kicker ml-auto self-center">{filtered.length} GAMES</span>
      </div>
      {games.isLoading ? <PageLoading /> : games.isError ? <ErrorState error={games.error} onRetry={() => games.refetch()} /> : byDate.length === 0 ? (
        <EmptyState title="NO GAMES MATCH" icon={<CalendarDays className="h-6 w-6 text-fg-dim" />}>Try another week, team or date.</EmptyState>
      ) : (
        byDate.map(([d, gs]) => (
          <section key={d} aria-label={dateLong(d)} className="space-y-3">
            <h2 className="flex items-center gap-3"><span className="display text-2xl">{dateLong(d)}</span><span className="kicker">{weekLabel(gs[0].week, gs[0].seasonType, gs[0].gameType)}</span><span className="h-px flex-1 bg-line" /></h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{gs.map((g) => <GameCard key={g.id} g={g} />)}</div>
          </section>
        ))
      )}
    </div>
  );
}
