import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Info } from 'lucide-react';
import { useGame, useMatchup } from '@/hooks/useData';
import { ErrorState, PageLoading, Skeleton } from '@/components/States';
import { PlayerRow } from '@/features/players/PlayerCard';
import { UnitRow } from '@/features/games/MatchupEdge';
import { TeamLogo } from '@/components/Img';
import { GameHero } from './Game';
import { vivid } from '@/lib/format';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Countdown({ kickoff }: { kickoff: string }) {
  const now = useNow();
  const diff = new Date(kickoff).getTime() - now;
  if (diff <= 0) return <div className="display text-3xl text-[#ffd166]">KICKOFF TIME HAS PASSED</div>;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff / 3600000) % 24), m = Math.floor((diff / 60000) % 60), s = Math.floor((diff / 1000) % 60);
  return (
    <div className="flex gap-4" aria-label="Time until kickoff">
      {[[d, 'DAYS'], [h, 'HRS'], [m, 'MIN'], [s, 'SEC']].map(([v, l]) => (
        <div key={l as string} className="text-center"><div className="display tabular text-5xl">{String(v).padStart(2, '0')}</div><div className="kicker">{l}</div></div>
      ))}
    </div>
  );
}

/** Game Day Mode: pre-game briefing. Never shows live scores/possession — nflverse provides no live feed. */
export default function GameDay() {
  const { id = '' } = useParams();
  const game = useGame(id);
  const matchup = useMatchup(id);
  if (game.isLoading) return <PageLoading />;
  if (game.isError) return <ErrorState error={game.error} onRetry={() => game.refetch()} />;
  const d = game.data!;
  const g = d.game;
  const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
  const m = matchup.data;
  const state = g.status === 'scheduled' ? 'PRE-GAME' : g.status === 'final' ? 'FINAL' : 'IN PROGRESS / AWAITING RESULT';
  return (
    <div className="space-y-6">
      <Link to={`/game/${id}`} className="kicker flex items-center gap-1 hover:text-fg"><ArrowLeft className="h-4 w-4" /> Full matchup</Link>
      <div className="flex items-center gap-3"><span className="rounded bg-volt px-2 py-0.5 font-display text-sm font-extrabold tracking-[0.2em] text-ink-950">GAME DAY</span><span className="kicker text-fg">{state}</span></div>
      <GameHero d={d} compact />
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        {g.status === 'scheduled' && g.kickoff ? (
          <><div><div className="kicker flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> KICKOFF IN</div><Countdown kickoff={g.kickoff} /></div>
            <p className="max-w-md text-sm text-fg-muted">Live play-by-play is not part of this data source. GRIDIRON shows the pre-game briefing and will show the final score once nflverse publishes it.</p></>
        ) : g.status === 'final' ? (
          <div className="display text-3xl">FINAL: {g.away.abbr} {g.away.score} – {g.home.abbr} {g.home.score}{g.overtime ? ' (OT)' : ''}</div>
        ) : (
          <p className="flex items-start gap-2 text-[#ffd166]"><Info className="mt-1 h-4 w-4 shrink-0" />{d.live.reason}</p>
        )}
      </div>
      {matchup.isLoading ? <Skeleton className="h-64" /> : m && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="panel p-4">
            <div className="panel-hd mb-2">Key players</div>
            {m.watch.slice(0, 8).map((p) => <PlayerRow key={p.id} p={p} teamColor={p.team === g.away.abbr ? ac : hc} />)}
          </div>
          <div className="space-y-4">
            <div className="panel p-4">
              <div className="panel-hd mb-2">Analytics matchup edges</div>
              {m.units.map((u) => <UnitRow key={u.unit} u={u} away={d.awayTeam} home={d.homeTeam} ac={ac} hc={hc} />)}
              <p className="mt-2 text-[11px] text-fg-dim">{m.disclaimer}</p>
            </div>
            <div className="panel p-4">
              <div className="panel-hd mb-2">Injuries</div>
              {(['away', 'home'] as const).map((k) => (
                <div key={k} className="mb-2">
                  <div className="mb-1 flex items-center gap-2"><TeamLogo src={(k === 'away' ? d.awayTeam : d.homeTeam).logo} abbr={g[k].abbr} size={20} /><span className="kicker">{g[k].abbr}</span></div>
                  {m.injuries[k].length ? m.injuries[k].map((p) => <PlayerRow key={p.id} p={p} teamColor={k === 'away' ? ac : hc} />) : <div className="kicker px-2 !text-[0.6rem]">NONE LISTED</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
