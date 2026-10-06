import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Radio } from 'lucide-react';
import { useHome, useSeasonGames } from '@/hooks/useData';
import { useSeason } from '@/hooks/useSeason';
import { GameCard } from '@/features/games/GameCard';
import { PlayerCard } from '@/features/players/PlayerCard';
import { PlayerListRow } from '@/features/players/PlayerListRow';
import { TeamLogo } from '@/components/Img';
import { RatingNumber } from '@/components/Rating';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, PageLoading } from '@/components/States';
import { dateLong, kickoffLocal, recordStr, statusLabel, vivid, weekLabel } from '@/lib/format';
import type { GameSummary } from '@/types/api';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Home() {
  const { meta } = useSeason();
  const home = useHome();
  const games = useSeasonGames(meta?.currentSeason);

  // Today / upcoming / recent are always derived from the schedule at view time (never frozen).
  const { today, upcoming, recent } = useMemo(() => {
    const all = games.data ?? [];
    const t = localToday();
    return {
      today: all.filter((g) => g.date === t),
      upcoming: all.filter((g) => g.date > t && g.status === 'scheduled').slice(0, 8),
      recent: all.filter((g) => g.status === 'final').slice().sort((a, b) => (b.kickoff ?? b.date).localeCompare(a.kickoff ?? a.date)).slice(0, 6),
    };
  }, [games.data]);

  if (home.isLoading) return <PageLoading label="Loading home" />;
  if (home.isError) return <ErrorState error={home.error} onRetry={() => home.refetch()} />;
  const h = home.data!;
  const fg = h.featured?.game;
  const freshFeatured = fg ? games.data?.find((g) => g.id === fg.id) ?? fg : null;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-line">
        <div className="absolute inset-0 stripe opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_85%_20%,rgba(90,216,255,0.18),transparent_70%)]" />
        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <div className="kicker text-ice">{meta?.currentSeason} SEASON · {h.week ? weekLabel(h.week) : 'OFFSEASON'}</div>
            <h1 className="display mt-2 text-[clamp(3.5rem,9vw,7.5rem)] italic tracking-[0.02em]">GRID<span className="text-ice">IRON</span></h1>
            <p className="display mt-1 text-[clamp(1.4rem,3vw,2.2rem)] text-fg-muted">Know who you're watching.</p>
            <p className="mt-4 max-w-lg text-fg-muted">Projected starting lineups, field alignment and independent analytics ratings for every player in every game — built from public nflverse data.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/matchups" className="inline-flex items-center gap-2 rounded-lg bg-ice px-4 py-2.5 font-display text-lg font-bold tracking-wider text-ink-950 hover:brightness-110">THIS WEEK'S MATCHUPS <ArrowRight className="h-5 w-5" /></Link>
              <Link to="/schedule" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-display text-lg font-bold tracking-wider hover:bg-white/5">FULL SCHEDULE</Link>
            </div>
          </div>
          {freshFeatured && h.featured ? <Featured g={freshFeatured} m={h.featured.matchup} /> : <EmptyState title="NO FEATURED MATCHUP">No upcoming games are on the schedule right now.</EmptyState>}
        </div>
      </section>

      <Section title="Today's games" kicker={dateLong(localToday())} action={{ to: '/schedule', label: 'Schedule' }}>
        {games.isLoading ? <div className="skeleton h-28" /> : today.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{today.map((g) => <GameCard key={g.id} g={g} />)}</div>
        ) : (
          <EmptyState title="NO GAMES TODAY">{upcoming[0] ? <>Next kickoff: <b className="text-fg">{upcoming[0].away.abbr} @ {upcoming[0].home.abbr}</b>, {dateLong(upcoming[0].date)} · {kickoffLocal(upcoming[0].kickoff)}</> : 'No upcoming games on the schedule.'}</EmptyState>
        )}
      </Section>

      {!!h.featured?.matchup?.watch.length && (
        <Section title="Who to watch" kicker={`${fg!.away.abbr} @ ${fg!.home.abbr} · highest-rated projected starters`} action={{ to: `/game/${fg!.id}`, label: 'Open matchup' }}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {h.featured.matchup.watch.slice(0, 6).map((p) => <PlayerCard key={p.id} p={p} teamColor={vivid(p.team === fg!.away.abbr ? fg!.away.primary : fg!.home.primary, p.team === fg!.away.abbr ? fg!.away.secondary : fg!.home.secondary)} />)}
          </div>
        </Section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Upcoming" kicker="Next on the schedule" action={{ to: '/schedule', label: 'All games' }}>
          {upcoming.length ? <div className="grid gap-3 sm:grid-cols-2">{upcoming.map((g) => <GameCard key={g.id} g={g} compact />)}</div> : <EmptyState title="NO UPCOMING GAMES" />}
        </Section>
        <Section title="Top players" kicker={`${h.season} position leaders · GRIDIRON Analytics Rating`} action={{ to: '/players', label: 'Leaderboards' }}>
          <div className="panel p-2">
            {h.topPlayers.length ? h.topPlayers.map((p) => <PlayerListRow key={p.id} p={p} />) : <EmptyState title="INSUFFICIENT DATA" />}
          </div>
        </Section>
      </div>

      <Section title="Biggest matchup edges" kicker={`${h.week ? weekLabel(h.week) : ''} · analytics comparison, not a prediction`} action={{ to: '/matchups', label: 'All matchups' }}>
        {h.biggestEdges.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {h.biggestEdges.map(({ game: g, edge, topUnit }) => {
              const lead = edge.edge === 'away' ? g.away : edge.edge === 'home' ? g.home : null;
              return (
                <Link key={g.id} to={`/game/${g.id}`} className="panel flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-white/20">
                  {lead && <TeamLogo src={lead.logo} abbr={lead.abbr} size={52} />}
                  <div className="min-w-0 flex-1">
                    <div className="kicker">{g.away.abbr} @ {g.home.abbr} · {statusLabel(g)}</div>
                    <div className="display text-2xl">{lead ? `${lead.abbr} +${Math.abs(edge.margin ?? 0).toFixed(1)}` : 'EVEN'}</div>
                    {topUnit && <div className="text-xs text-fg-muted">Largest gap: {topUnit.unit} ({topUnit.away != null ? Math.round(topUnit.away) : '—'} vs {topUnit.home != null ? Math.round(topUnit.home) : '—'})</div>}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : <EmptyState title="DATA UNAVAILABLE">Matchup edges appear once projected starters have ratings.</EmptyState>}
      </Section>

      <Section title="Recent results" kicker="Final scores" action={{ to: '/schedule', label: 'Schedule' }}>
        {recent.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recent.map((g) => <GameCard key={g.id} g={g} compact />)}</div> : <EmptyState title="NO COMPLETED GAMES YET" />}
      </Section>
    </div>
  );
}

function Featured({ g, m }: { g: GameSummary; m: import('@/types/api').MatchupResponse | null }) {
  const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
  const lead = m?.overall.edge === 'away' ? g.away : m?.overall.edge === 'home' ? g.home : null;
  return (
    <Link to={`/game/${g.id}`} className="panel group block overflow-hidden p-5 transition hover:border-white/20" aria-label={`Featured matchup ${g.away.name} at ${g.home.name}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="kicker flex items-center gap-1.5 text-volt"><Radio className="h-3.5 w-3.5" /> FEATURED MATCHUP</span>
        <span className="kicker">{weekLabel(g.week, g.seasonType, g.gameType)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[g.away, null, g.home].map((s, i) =>
          s ? (
            <div key={s.abbr} className="text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${i === 0 ? ac : hc}44, transparent 70%)` }}>
                <TeamLogo src={s.logo} abbr={s.abbr} size={76} />
              </div>
              <div className="display mt-2 text-2xl">{s.nickname}</div>
              <div className="kicker">{recordStr(s.record)}</div>
              {m && <RatingNumber value={i === 0 ? m.overall.away : m.overall.home} className="mt-1 block text-3xl" />}
            </div>
          ) : (
            <div key="vs" className="display text-4xl italic text-fg-dim">VS</div>
          ),
        )}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-sm">
        <span className="text-fg-muted">{dateLong(g.date)} · {statusLabel(g)}</span>
        <span className="display text-lg">{lead ? <>{lead.abbr} <span className="text-fg-muted">EDGE</span></> : m ? 'EVEN' : ''}</span>
      </div>
      <div className="text-xs text-fg-dim">{g.stadium}</div>
    </Link>
  );
}
