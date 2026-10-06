import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { useDepth, useRoster, useSeasonGames, useTeam, useTeams } from '@/hooks/useData';
import { useSeason } from '@/hooks/useSeason';
import { TeamLogo } from '@/components/Img';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, PageLoading, Skeleton } from '@/components/States';
import { GameCard } from '@/features/games/GameCard';
import { PlayerListRow } from '@/features/players/PlayerListRow';
import { PlayerRow } from '@/features/players/PlayerCard';
import { recordStr, vivid } from '@/lib/format';
import type { DepthChartEntry, TeamLite } from '@/types/api';

export function TeamsIndex() {
  const teams = useTeams();
  const { season } = useSeason();
  const games = useSeasonGames(season);
  const records = useMemo(() => {
    const r: Record<string, { w: number; l: number; t: number }> = {};
    for (const g of games.data ?? []) {
      if (g.status !== 'final' || g.seasonType !== 'REG') continue;
      for (const [me, them] of [[g.away, g.home], [g.home, g.away]] as const) {
        const x = (r[me.abbr] ??= { w: 0, l: 0, t: 0 });
        if (me.score! > them.score!) x.w++; else if (me.score! < them.score!) x.l++; else x.t++;
      }
    }
    return r;
  }, [games.data]);
  if (teams.isLoading) return <PageLoading />;
  if (teams.isError) return <ErrorState error={teams.error} onRetry={() => teams.refetch()} />;
  const byDiv = new Map<string, TeamLite[]>();
  for (const t of teams.data!) byDiv.set(t.division ?? 'Other', [...(byDiv.get(t.division ?? 'Other') ?? []), t]);
  return (
    <div className="space-y-8">
      <header><div className="kicker">{season} · 32 teams</div><h1 className="display text-5xl">Teams</h1></header>
      {['AFC', 'NFC'].map((conf) => (
        <section key={conf} aria-label={conf} className="space-y-3">
          <h2 className="display text-3xl">{conf}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...byDiv.entries()].filter(([d]) => d.startsWith(conf)).sort().map(([div, ts]) => (
              <div key={div} className="panel p-3">
                <div className="panel-hd mb-2">{div}</div>
                {ts.map((t) => {
                  const rec = records[t.abbr];
                  return (
                    <Link key={t.abbr} to={`/team/${t.abbr}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.05]">
                      <TeamLogo src={t.logo} abbr={t.abbr} size={36} />
                      <div className="flex-1"><div className="font-semibold">{t.name}</div></div>
                      <span className="display tabular text-lg text-fg-muted">{rec ? recordStr({ wins: rec.w, losses: rec.l, ties: rec.t }) : '0-0'}</span>
                      <span className="h-6 w-1 rounded-full" style={{ background: vivid(t.primary, t.secondary) }} />
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const TABS = ['OVERVIEW', 'ROSTER', 'DEPTH CHART', 'OFFENSE', 'DEFENSE', 'INJURIES', 'SCHEDULE'] as const;
type Tab = (typeof TABS)[number];
const OFF = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'T', 'G', 'C', 'LT', 'LG', 'RG', 'RT', 'OT', 'OG']);
const DEF = new Set(['EDGE', 'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB']);

function DepthGrid({ entries, filter }: { entries: DepthChartEntry[]; filter?: (e: DepthChartEntry) => boolean }) {
  const list = filter ? entries.filter(filter) : entries;
  const byPos = new Map<string, DepthChartEntry[]>();
  for (const e of list) byPos.set(e.position, [...(byPos.get(e.position) ?? []), e]);
  if (!byPos.size) return <EmptyState title="DEPTH CHART DATA UNAVAILABLE" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...byPos.entries()].map(([pos, es]) => (
        <div key={pos} className="panel p-3">
          <div className="panel-hd mb-1">{pos}</div>
          {es.sort((a, b) => a.depth - b.depth).map((e) => (
            <div key={e.player.id + e.depth} className="flex items-center gap-2">
              <span className={clsx('kicker w-8 shrink-0 !text-[0.6rem]', e.depth === 1 && 'text-ice')}>{e.depth === 1 ? '1ST' : e.depth === 2 ? '2ND' : e.depth === 3 ? '3RD' : `${e.depth}TH`}</span>
              <div className="min-w-0 flex-1"><PlayerListRow p={e.player} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TeamPage() {
  const { abbr = '' } = useParams();
  const { season, meta, setSeason } = useSeason();
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const team = useTeam(abbr.toUpperCase(), season);
  const needRoster = tab === 'ROSTER';
  const needDepth = ['DEPTH CHART', 'OFFENSE', 'DEFENSE'].includes(tab);
  const roster = useRoster(abbr.toUpperCase(), season, needRoster);
  const depth = useDepth(abbr.toUpperCase(), season, needDepth);
  if (team.isLoading) return <PageLoading />;
  if (team.isError) return <ErrorState error={team.error} onRetry={() => team.refetch()} />;
  const d = team.data!;
  const t = d.team;
  const color = vivid(t.primary, t.secondary);
  return (
    <div className="space-y-6">
      <Link to="/teams" className="kicker flex items-center gap-1 hover:text-fg"><ArrowLeft className="h-4 w-4" /> Teams</Link>
      <section className="relative overflow-hidden rounded-2xl border border-line">
        <div className="absolute inset-0" style={{ background: `linear-gradient(110deg, ${color}66, ${t.secondary ?? color}18 55%, transparent)` }} />
        <div className="absolute inset-0 stripe opacity-60" />
        <div className="relative flex flex-wrap items-center gap-6 p-6 sm:p-8">
          <TeamLogo src={t.logo} abbr={t.abbr} size={120} />
          <div className="flex-1">
            <div className="kicker">{t.conference} · {t.division}</div>
            <h1 className="display text-5xl sm:text-7xl">{t.name}</h1>
            <div className="mt-1 text-fg-muted">{t.stadium}</div>
          </div>
          <div className="text-right">
            <div className="kicker">{d.season} RECORD</div>
            <div className="display tabular text-6xl">{recordStr(d.record)}</div>
            <select aria-label="Season" value={season} onChange={(e) => setSeason(Number(e.target.value))} className="mt-2 rounded-md border border-line bg-ink-800 px-2 py-1 font-display text-sm font-bold">
              {meta?.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>
      <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Team sections">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={clsx('relative shrink-0 px-4 py-3 font-display font-bold tracking-[0.14em]', tab === x ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
            {x}{tab === x && <span className="absolute inset-x-2 -bottom-px h-[2px]" style={{ background: color }} />}
          </button>
        ))}
      </div>

      {tab === 'OVERVIEW' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Section title="Top players" kicker={`Top 5 by GRIDIRON rating · ${d.season}`}>
            <div className="panel p-2">{d.topPlayers.length ? d.topPlayers.slice(0, 5).map((p, i) => <PlayerListRow key={p.id} p={p} rank={i + 1} />) : <EmptyState title="INSUFFICIENT DATA" />}</div>
          </Section>
          <Section title="Next up" kicker="Schedule">
            <div className="grid gap-3">{d.schedule.filter((g) => g.status !== 'final').slice(0, 3).map((g) => <GameCard key={g.id} g={g} compact />)}
              {!d.schedule.some((g) => g.status !== 'final') && <EmptyState title="SEASON COMPLETE" />}</div>
          </Section>
        </div>
      )}
      {tab === 'ROSTER' && (roster.isLoading ? <Skeleton className="h-96" /> : roster.isError ? <ErrorState error={roster.error} /> : roster.data?.length ? (
        <div className="panel grid gap-x-4 p-2 md:grid-cols-2 xl:grid-cols-3">
          {roster.data.map((p) => <PlayerListRow key={p.id} p={p} />)}
        </div>
      ) : <EmptyState title="ROSTER DATA UNAVAILABLE" />)}
      {needDepth && (depth.isLoading ? <Skeleton className="h-96" /> : depth.isError ? <ErrorState error={depth.error} /> : depth.data ? (
        <div className="space-y-3">
          <p className="text-xs text-fg-dim">Depth chart from nflverse · {depth.data.season} week {depth.data.week ?? '—'} ({depth.data.source ?? 'source unknown'}). Order reflects the team's published depth chart, not confirmed starters.</p>
          <DepthGrid entries={depth.data.entries} filter={tab === 'OFFENSE' ? (e) => OFF.has(e.position) || e.group === 'OFF' : tab === 'DEFENSE' ? (e) => DEF.has(e.position) || e.group === 'DEF' : undefined} />
        </div>
      ) : null)}
      {tab === 'INJURIES' && (d.injuries.length ? (
        <div className="panel grid gap-x-4 p-2 md:grid-cols-2">{d.injuries.map((p) => <PlayerRow key={p.id} p={p} teamColor={color} />)}</div>
      ) : <EmptyState title="NO PLAYERS ON THE LATEST INJURY REPORT">Based on the most recent nflverse injury report for {d.season}.</EmptyState>)}
      {tab === 'SCHEDULE' && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.schedule.map((g) => <GameCard key={g.id} g={g} compact />)}</div>}
    </div>
  );
}
