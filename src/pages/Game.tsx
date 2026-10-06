import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Info, MapPin, MonitorPlay } from 'lucide-react';
import clsx from 'clsx';
import { useGame, useLineups, useMatchup } from '@/hooks/useData';
import { TeamLogo } from '@/components/Img';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, PageLoading, Skeleton } from '@/components/States';
import { Field } from '@/features/lineups/Field';
import { KeyMatchups, MatchupEdgePanel } from '@/features/games/MatchupEdge';
import { GameCard } from '@/features/games/GameCard';
import { PlayerCard, PlayerNode, PlayerRow } from '@/features/players/PlayerCard';
import { dateLong, kickoffLocal, recordStr, statusLabel, vivid, weekLabel } from '@/lib/format';
import type { GameDetail, TeamLineup } from '@/types/api';

export function GameHero({ d, compact }: { d: GameDetail; compact?: boolean }) {
  const g = d.game;
  const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
  const final = g.status === 'final';
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line" aria-label="Game header">
      <div className="absolute inset-0" style={{ background: `linear-gradient(105deg, ${ac}40 0%, transparent 42%, transparent 58%, ${hc}40 100%)` }} />
      <div className="absolute inset-0 stripe opacity-60" />
      <div className={clsx('relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6', compact ? 'p-4' : 'p-5 sm:p-8')}>
        {[g.away, g.home].map((s, i) => (
          <div key={s.abbr} className={clsx('flex items-center gap-3 sm:gap-5', i === 1 ? 'order-3 flex-row-reverse text-right' : 'order-1')}>
            <Link to={`/team/${s.abbr}`} className="shrink-0"><TeamLogo src={s.logo} abbr={s.abbr} size={compact ? 56 : 96} className="sm:!h-[110px] sm:!w-[110px]" /></Link>
            <div className="min-w-0">
              <div className="kicker hidden sm:block">{i === 0 ? 'AWAY' : 'HOME'} · {s.name.replace(` ${s.nickname}`, '')}</div>
              <div className={clsx('display truncate', compact ? 'text-2xl sm:text-4xl' : 'text-3xl sm:text-6xl')}>{s.nickname}</div>
              <div className="kicker">{recordStr(s.record)}{final ? '' : ' entering'}</div>
            </div>
            {final && <div className={clsx('display tabular text-4xl sm:text-7xl', i === 0 ? 'ml-auto' : 'mr-auto', ((i === 0 ? g.away.score! < g.home.score! : g.home.score! < g.away.score!)) && 'text-fg-muted')}>{s.score}</div>}
          </div>
        ))}
        <div className="order-2 text-center">
          <div className="display text-3xl italic text-fg-dim sm:text-5xl">VS</div>
        </div>
      </div>
      <div className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-white/10 bg-black/30 px-4 py-2.5 text-sm">
        <span className="kicker text-fg">{weekLabel(g.week, g.seasonType, g.gameType)} · {g.season}</span>
        <span className="kicker text-ice">{statusLabel(g)}</span>
        <span className="text-fg-muted">{dateLong(g.date)}{g.status === 'scheduled' ? ` · ${kickoffLocal(g.kickoff)}` : ''}</span>
        {g.stadium && <span className="flex items-center gap-1 text-fg-muted"><MapPin className="h-3.5 w-3.5" />{g.stadium}{g.roof ? ` · ${g.roof}` : ''}{g.surface ? ` · ${g.surface}` : ''}</span>}
      </div>
    </section>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-ink-850 p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={clsx('rounded-md px-3 py-1.5 font-display text-sm font-bold tracking-[0.14em] transition sm:px-4', value === o.v ? 'text-ink-950' : 'text-fg-muted hover:text-fg')}
          style={value === o.v ? { background: o.color ?? '#5ad8ff' } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SideLists({ l, color }: { l: TeamLineup; color: string }) {
  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center gap-2"><TeamLogo src={l.team.logo} abbr={l.team.abbr} size={28} /><span className="display text-xl">{l.team.nickname}</span><span className="kicker ml-auto">DEPTH WK {l.depthWeek ?? '—'}</span></div>
      {(['offense', 'defense', 'specialists'] as const).map((k) => (
        <div key={k} className="mb-3">
          <div className="kicker mb-1 border-b border-white/5 pb-1">{k}</div>
          {[...l[k], ...(k === 'defense' && l.nickel ? [l.nickel] : [])].map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="kicker w-10 shrink-0 !text-[0.6rem]">{s.label}</span>
              <div className="min-w-0 flex-1">{s.player ? <PlayerRow p={s.player} teamColor={color} /> : <div className="px-2 py-2 text-xs text-fg-dim">DATA UNAVAILABLE</div>}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Game() {
  const { id = '' } = useParams();
  const game = useGame(id);
  const lineups = useLineups(id);
  const matchup = useMatchup(id);
  const [side, setSide] = useState<'away' | 'home'>('away');
  const [unit, setUnit] = useState<'OFFENSE' | 'DEFENSE'>('OFFENSE');

  if (game.isLoading) return <PageLoading label="Loading matchup" />;
  if (game.isError) return <ErrorState error={game.error} onRetry={() => game.refetch()} />;
  const d = game.data!;
  const g = d.game;
  const ac = vivid(g.away.primary, g.away.secondary), hc = vivid(g.home.primary, g.home.secondary);
  const L = lineups.data;
  const lineup = L ? L[side] : null;
  const color = side === 'away' ? ac : hc;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/schedule" className="kicker flex items-center gap-1 hover:text-fg"><ArrowLeft className="h-4 w-4" /> Schedule</Link>
        <Link to={`/game/${id}/gameday`} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 font-display text-sm font-bold tracking-wider hover:bg-white/5"><MonitorPlay className="h-4 w-4 text-volt" /> GAME DAY MODE</Link>
      </div>
      <GameHero d={d} />
      {g.status !== 'scheduled' && g.status !== 'final' && (
        <div className="panel flex items-start gap-3 border-[#ffd166]/30 p-4 text-sm text-[#ffd166]" role="status"><Info className="mt-0.5 h-4 w-4 shrink-0" />{d.live.reason}</div>
      )}

      {matchup.isLoading ? <Skeleton className="h-80" /> : matchup.isError ? <ErrorState error={matchup.error} compact /> : (
        <MatchupEdgePanel m={matchup.data!} away={d.awayTeam} home={d.homeTeam} ac={ac} hc={hc} />
      )}

      <section aria-labelledby="lineups-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker text-ice">{L?.label ?? 'STARTING LINEUPS'}</div>
            <h2 id="lineups-h" className="display text-3xl">Starting lineups</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle label="Team" value={side} onChange={setSide} options={[{ v: 'away', label: g.away.abbr, color: ac }, { v: 'home', label: g.home.abbr, color: hc }]} />
            <Toggle label="Unit" value={unit} onChange={setUnit} options={[{ v: 'OFFENSE', label: 'OFFENSE' }, { v: 'DEFENSE', label: 'DEFENSE' }]} />
          </div>
        </div>
        {L && <p className="flex items-start gap-2 text-xs text-fg-dim"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{L.note} Hover (or tap) a player for details; click to open the profile.</p>}
        {lineups.isLoading ? <Skeleton className="h-[600px]" /> : lineups.isError ? <ErrorState error={lineups.error} compact onRetry={() => lineups.refetch()} /> : lineup && (lineup.offense.some((s) => s.player) || lineup.defense.some((s) => s.player)) ? (
          <>
            <Field lineup={lineup} unit={unit} color={color} />
            <div className="flex flex-wrap items-center gap-3">
              {unit === 'DEFENSE' && lineup.nickel && <div className="flex items-center gap-2"><span className="kicker">SUB PACKAGE</span><PlayerNode p={lineup.nickel.player} label="NB" teamColor={color} /></div>}
              <div className="flex items-center gap-2"><span className="kicker">SPECIALISTS</span>{lineup.specialists.map((s) => <PlayerNode key={s.key} p={s.player} label={s.label} teamColor={color} />)}</div>
            </div>
          </>
        ) : <EmptyState title="DEPTH CHART DATA UNAVAILABLE">nflverse has not published a depth chart for this team-week.</EmptyState>}
      </section>

      {matchup.data && (
        <>
          <Section title="Who to watch" kicker="Highest-rated projected starters in this game">
            {matchup.data.watch.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {matchup.data.watch.map((p) => <PlayerCard key={p.id} p={p} teamColor={p.team === g.away.abbr ? ac : hc} />)}
              </div>
            ) : <EmptyState title="INSUFFICIENT DATA" />}
          </Section>
          <Section title="Key matchups" kicker="Unit vs unit, from projected starters">
            {matchup.data.keyMatchups.length ? <KeyMatchups items={matchup.data.keyMatchups} ac={ac} hc={hc} away={g.away.abbr} /> : <EmptyState title="DATA UNAVAILABLE" />}
          </Section>
          <Section title="Injury report" kicker="From the latest nflverse injury report for this week">
            <div className="grid gap-3 md:grid-cols-2">
              {(['away', 'home'] as const).map((k) => {
                const list = matchup.data!.injuries[k];
                const t = k === 'away' ? d.awayTeam : d.homeTeam;
                return (
                  <div key={k} className="panel p-3">
                    <div className="mb-2 flex items-center gap-2"><TeamLogo src={t.logo} abbr={t.abbr} size={26} /><span className="display text-lg">{t.nickname}</span></div>
                    {list.length ? list.map((p) => <PlayerRow key={p.id} p={p} teamColor={k === 'away' ? ac : hc} />) : <div className="kicker px-2 py-3">NO PLAYERS LISTED ON THE INJURY REPORT</div>}
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}

      {L && (
        <Section title="Full lineups" kicker="Every projected starter, by unit">
          <div className="grid gap-3 lg:grid-cols-2"><SideLists l={L.away} color={ac} /><SideLists l={L.home} color={hc} /></div>
        </Section>
      )}

      {!!d.headToHead.length && (
        <Section title="Recent meetings" kicker="Head to head">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.headToHead.map((x) => <GameCard key={x.id} g={x} compact />)}</div>
        </Section>
      )}
    </div>
  );
}
