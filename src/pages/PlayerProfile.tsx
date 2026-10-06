import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGameLog, usePlayer, usePlayerRating, usePlayerStats } from '@/hooks/useData';
import { Headshot, TeamLogo } from '@/components/Img';
import { ConfidencePill, RatingBadge, StatBar, StatusPill, TierTag } from '@/components/Rating';
import { EmptyState, ErrorState, PageLoading, Skeleton } from '@/components/States';
import { fmt, heightStr, ordinal, POSITION_NAMES, tierColor, vivid } from '@/lib/format';
import { ADV_LABELS, LOG_COLS, SEASON_COLS, statGroup, trendKeys, type Col } from '@/lib/stats';
import type { GameLogRow, PlayerProfile as Profile, RatingComponent } from '@/types/api';

const TABS = ['OVERVIEW', 'SEASON', 'GAME LOG', 'ADVANCED', 'BIO'] as const;
type Tab = (typeof TABS)[number];

const tt = { contentStyle: { background: '#0b1220', border: '1px solid rgba(148,170,210,0.2)', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#8d99b1' } };
const axis = { stroke: '#5f6b84', fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartCard({ title, sub, children, empty }: { title: string; sub?: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="panel p-4">
      <div className="panel-hd">{title}</div>
      {sub && <div className="text-[11px] text-fg-dim">{sub}</div>}
      <div className="mt-3 h-48">{empty ? <div className="grid h-full place-items-center"><span className="kicker">DATA UNAVAILABLE</span></div> : children}</div>
    </div>
  );
}

function StatTable({ cols, rows, lead }: { cols: Col[]; rows: Record<string, unknown>[]; lead: { label: string; render: (r: Record<string, unknown>) => React.ReactNode }[] }) {
  return (
    <div className="panel scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm tabular">
        <thead><tr className="border-b border-line">
          {lead.map((l) => <th key={l.label} scope="col" className="kicker whitespace-nowrap px-3 py-2 text-left">{l.label}</th>)}
          {cols.map((c) => <th key={c.key} scope="col" title={c.title} className="kicker whitespace-nowrap px-3 py-2 text-right">{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
              {lead.map((l) => <td key={l.label} className="whitespace-nowrap px-3 py-2">{l.render(r)}</td>)}
              {cols.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right">{fmt(r[c.key] as number | null, c.d ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentBreakdown({ comps }: { comps: RatingComponent[] }) {
  const groups = ['efficiency', 'advanced', 'production', 'consistency', 'recent_form'];
  const names: Record<string, string> = { efficiency: 'Efficiency · 40%', advanced: 'Advanced impact · 25%', production: 'Production · 20%', consistency: 'Consistency · 10%', recent_form: 'Recent form · 5%' };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groups.map((gname) => {
        const list = comps.filter((c) => c.component === gname);
        if (!list.length) return null;
        return (
          <div key={gname} className="panel p-4">
            <div className="panel-hd mb-3">{names[gname]}</div>
            <div className="space-y-2.5">
              {list.map((c) => (
                <div key={c.metric} className={clsx(c.percentile == null && 'opacity-50')}>
                  <StatBar label={c.label} value={c.percentile} sub={c.percentile == null ? 'Not available for this season — weight redistributed' : `Raw: ${fmt(c.raw, Math.abs(c.raw ?? 0) < 10 ? 3 : 1)} · ${ordinal(Math.round(c.percentile))} percentile · weight ${(100 * (c.weight ?? 0)).toFixed(0)}%${c.scope === 'team' ? ' · team-level indicator' : ''}${c.higherIsBetter ? '' : ' · lower is better'}`} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BioPanel({ p }: { p: Profile }) {
  const facts: [string, string][] = [
    ['Position', p.position ?? '—'], ['Jersey', p.jersey != null ? `#${p.jersey}` : '—'], ['Height', heightStr(p.height)], ['Weight', p.weight ? `${p.weight} lb` : '—'],
    ['Age', p.age != null ? String(p.age) : '—'], ['Born', p.birthDate ?? '—'], ['College', p.college ?? '—'], ['Experience', p.experience != null ? `${p.experience} seasons` : '—'],
    ['Draft', p.draft.year ? `${p.draft.year}${p.draft.round ? ` · Rd ${p.draft.round}, Pick ${p.draft.pick}` : ''}${p.draft.team ? ` (${p.draft.team})` : ''}` : 'Undrafted / not available'],
    ['Rookie season', p.rookieSeason ? String(p.rookieSeason) : '—'], ['Status', p.status ?? '—'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <dl className="panel grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        {facts.map(([k, v]) => <div key={k}><dt className="kicker !text-[0.6rem]">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
      </dl>
      <div className="panel space-y-3 p-4 text-sm leading-relaxed text-fg-muted">
        <div className="panel-hd">Profile</div>
        {p.bio?.bio ? <p>{p.bio.bio}</p> : <p className="kicker">BIO DATA UNAVAILABLE</p>}
        {p.bio?.career && <p>{p.bio.career}</p>}
        {p.bio?.college && <p>{p.bio.college}</p>}
        {p.bio?.draft && <p>{p.bio.draft}</p>}
        <p className="flex items-start gap-2 text-[11px] text-fg-dim"><Info className="mt-0.5 h-3 w-3 shrink-0" />Bio text is generated only from facts and statistics stored in the GRIDIRON database (nflverse player, roster and stats tables).</p>
      </div>
    </div>
  );
}

export default function PlayerProfile() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [season, setSeason] = useState<number>();
  const player = usePlayer(id);
  const rating = usePlayerRating(id, season);
  const stats = usePlayerStats(id);
  const log = useGameLog(id);
  const p = player.data;

  useEffect(() => { setSeason(undefined); setTab('OVERVIEW'); }, [id]);
  const r = rating.data?.rating ?? null;
  const activeSeason = season ?? r?.season ?? p?.ratings[0]?.season;
  const group = statGroup(r?.position ?? p?.ratings[0]?.position ?? p?.position);
  const tk = trendKeys(group);

  const seasonLog = useMemo(() => (log.data ?? []).filter((g) => g.season === activeSeason).slice().sort((a, b) => a.week - b.week), [log.data, activeSeason]);
  const ratingSeries = useMemo(() => (p?.ratings ?? []).filter((x) => x.overall != null).slice().reverse().map((x) => ({ season: String(x.season), overall: x.overall })), [p]);

  if (player.isLoading) return <PageLoading label="Loading player" />;
  if (player.isError) return <ErrorState error={player.error} onRetry={() => player.refetch()} />;
  if (!p) return null;
  const color = vivid(p.team?.primary, p.team?.secondary);
  const seasonsAvail = p.ratings.map((x) => x.season);
  const last5 = seasonLog.slice(-5);

  return (
    <div className="space-y-6" style={{ ['--team' as string]: color }}>
      <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="kicker flex items-center gap-1 hover:text-fg"><ArrowLeft className="h-4 w-4" /> Back</button>

      <section className="relative overflow-hidden rounded-2xl border border-line" aria-label="Player header">
        <div className="absolute inset-0" style={{ background: `linear-gradient(115deg, ${color}55 0%, ${color}10 45%, transparent 70%)` }} />
        <div className="absolute inset-0 stripe opacity-60" />
        {p.team?.logo && <img src={p.team.logo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-80 w-80 opacity-[0.07]" />}
        <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[auto_1fr_auto] md:items-end">
          <Headshot src={p.headshot} alt={p.name} className="mx-auto h-44 w-44 rounded-xl bg-ink-800/60 md:mx-0 md:h-56 md:w-56" imgClassName="object-contain object-bottom" />
          <div className="min-w-0 text-center md:text-left">
            <div className="kicker flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {p.team && <Link to={`/team/${p.team.abbr}`} className="flex items-center gap-1.5 hover:text-fg"><TeamLogo src={p.team.logo} abbr={p.team.abbr} size={20} />{p.team.name}</Link>}
              <span>· #{p.jersey ?? '—'} · {p.position}</span>
            </div>
            <h1 className="display mt-1 text-5xl sm:text-7xl">{p.firstName} <span style={{ color }}>{p.lastName}</span></h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <StatusPill s={p.currentStatus} />
              <span className="text-sm text-fg-muted">{[heightStr(p.height), p.weight ? `${p.weight} lb` : null, p.age != null ? `Age ${p.age}` : null, p.college].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="kicker">GRIDIRON RATING{activeSeason ? ` · ${activeSeason}` : ''}</div>
            {rating.isLoading ? <Skeleton className="h-24 w-24" /> : <RatingBadge value={r?.overall ?? null} size="xl" />}
            <TierTag tier={r?.tier ?? 'INSUFFICIENT DATA'} />
            <ConfidencePill c={r?.overall != null ? r.confidence : null} />
            {seasonsAvail.length > 1 && (
              <select aria-label="Rating season" value={activeSeason} onChange={(e) => setSeason(Number(e.target.value))} className="mt-1 rounded-md border border-line bg-ink-800 px-2 py-1 font-display text-sm font-bold">
                {seasonsAvail.map((s) => <option key={s} value={s}>{s} SEASON</option>)}
              </select>
            )}
          </div>
        </div>
      </section>

      <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Profile sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx('relative shrink-0 px-4 py-3 font-display font-bold tracking-[0.16em]', tab === t ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
            {t}{tab === t && <span className="absolute inset-x-2 -bottom-px h-[2px]" style={{ background: color }} />}
          </button>
        ))}
      </div>

      {tab === 'OVERVIEW' && (
        <div className="space-y-4">
          {r?.overall != null ? (
            <div className="panel grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <div className="display text-3xl">{r.positionScore != null ? `${ordinal(Math.round(r.positionScore))} percentile` : '—'}</div>
                <div className="text-fg-muted">among NFL {POSITION_NAMES[r.position] ?? r.position} · {r.season}</div>
                <div className="mt-4 flex gap-6">
                  <div><div className="kicker">POSITION RANK</div><div className="display text-3xl">{r.positionRank ? `#${r.positionRank}` : '—'}<span className="text-lg text-fg-dim"> / {r.positionCount ?? '—'}</span></div></div>
                  <div><div className="kicker">GAMES IN SAMPLE</div><div className="display text-3xl">{r.gamesSample ?? '—'}</div></div>
                </div>
                <p className="mt-4 text-xs text-fg-dim">Rating = 40% efficiency + 25% advanced + 20% production + 10% consistency + 5% recent form, each a percentile within {r.position}s of the same season. Missing inputs are omitted and their weight redistributed (lowering confidence).</p>
              </div>
              <div className="space-y-3">
                <StatBar label="Efficiency (40%)" value={r.efficiency} />
                <StatBar label="Advanced impact (25%)" value={r.advanced} />
                <StatBar label="Production (20%)" value={r.production} />
                <StatBar label="Consistency (10%)" value={r.consistency} />
                <StatBar label="Recent form (5%)" value={r.recentForm} />
              </div>
            </div>
          ) : <EmptyState title="INSUFFICIENT DATA">Not enough qualifying snaps or games in {activeSeason ?? 'this season'} to calculate a GRIDIRON rating.</EmptyState>}
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Rating by season" sub="GRIDIRON Analytics Rating history" empty={ratingSeries.length === 0}>
              <ResponsiveContainer><LineChart data={ratingSeries} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid stroke="rgba(148,170,210,0.08)" vertical={false} />
                <XAxis dataKey="season" {...axis} /><YAxis domain={[40, 100]} {...axis} /><Tooltip {...tt} />
                <ReferenceLine y={90} stroke="#c49bff" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Line type="monotone" dataKey="overall" name="Rating" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} />
              </LineChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Last 5 games" sub={`Weekly game grades · ${activeSeason ?? ''}`} empty={!last5.length}>
              <ResponsiveContainer><BarChart data={last5.map((g) => ({ name: `W${g.week} ${g.opp ?? ''}`, grade: g.gameScore }))} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid stroke="rgba(148,170,210,0.08)" vertical={false} />
                <XAxis dataKey="name" {...axis} /><YAxis domain={[0, 100]} {...axis} /><Tooltip {...tt} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="grade" name="Game grade" radius={[4, 4, 0, 0]}>{last5.map((g, i) => <Cell key={i} fill={tierColor(g.gameScore)} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="EPA trend" sub={tk.epa ? `Expected points added per game · ${activeSeason ?? ''}` : 'EPA is not tracked for this position'} empty={!tk.epa || !seasonLog.some((g) => g[tk.epa!] != null)}>
              <ResponsiveContainer><LineChart data={seasonLog.map((g) => ({ wk: `W${g.week}`, epa: g[tk.epa ?? ''] }))} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid stroke="rgba(148,170,210,0.08)" vertical={false} />
                <XAxis dataKey="wk" {...axis} /><YAxis {...axis} /><Tooltip {...tt} /><ReferenceLine y={0} stroke="#5f6b84" />
                <Line type="monotone" dataKey="epa" name="EPA" stroke="#5ad8ff" strokeWidth={2} dot={{ r: 2.5 }} />
              </LineChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Production trend" sub={`${tk.prodLabel} per game · ${activeSeason ?? ''}`} empty={!seasonLog.some((g) => g[tk.prod] != null)}>
              <ResponsiveContainer><BarChart data={seasonLog.map((g) => ({ wk: `W${g.week}`, v: g[tk.prod] }))} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid stroke="rgba(148,170,210,0.08)" vertical={false} />
                <XAxis dataKey="wk" {...axis} /><YAxis {...axis} /><Tooltip {...tt} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="v" name={tk.prodLabel} fill={color} radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {tab === 'SEASON' && (stats.isLoading ? <Skeleton className="h-64" /> : stats.isError ? <ErrorState error={stats.error} /> : stats.data?.seasons.length ? (
        <StatTable cols={SEASON_COLS[group]} rows={stats.data.seasons as Record<string, unknown>[]}
          lead={[{ label: 'SEASON', render: (x) => <span className="font-semibold">{String(x.season)}{x.seasonType === 'POST' ? ' · POST' : ''}</span> }, { label: 'TEAM', render: (x) => String(x.team ?? '—') }, {
            label: 'RTG', render: (x) => { const rr = p.ratings.find((y) => y.season === x.season); return x.seasonType === 'REG' && rr?.overall != null ? <span className="display text-lg" style={{ color: tierColor(rr.overall) }}>{Math.round(rr.overall)}</span> : '—'; },
          }]} />
      ) : <EmptyState title="NO SEASON STATS" />)}

      {tab === 'GAME LOG' && (log.isLoading ? <Skeleton className="h-64" /> : log.isError ? <ErrorState error={log.error} /> : log.data?.length ? (
        <StatTable cols={LOG_COLS[group]} rows={(log.data as GameLogRow[]).map((g) => ({ ...g, offense_pct: g.offense_pct != null ? Number(g.offense_pct) * 100 : null })) as Record<string, unknown>[]}
          lead={[
            { label: 'SEASON', render: (x) => `${x.season}${x.seasonType === 'POST' ? ' P' : ''}` }, { label: 'WK', render: (x) => String(x.week) },
            { label: 'OPP', render: (x) => x.gameId ? <Link className="hover:underline" to={`/game/${x.gameId}`}>{x.home === false ? '@' : 'vs'} {String(x.opp ?? '')}</Link> : String(x.opp ?? '—') },
            { label: 'RESULT', render: (x) => <span className={clsx(String(x.result ?? '').startsWith('W') ? 'text-[#5cf2a0]' : String(x.result ?? '').startsWith('L') ? 'text-[#ff6b7a]' : 'text-fg-muted')}>{String(x.result ?? '—')}</span> },
            { label: 'GRADE', render: (x) => x.gameScore != null ? <span className="display text-lg" style={{ color: tierColor(x.gameScore as number) }}>{Math.round(x.gameScore as number)}</span> : '—' },
          ]} />
      ) : <EmptyState title="NO GAME LOG" />)}

      {tab === 'ADVANCED' && (
        <div className="space-y-6">
          {rating.isLoading ? <Skeleton className="h-64" /> : rating.data?.components.length ? (
            <>
              <div className="flex items-center gap-2"><h2 className="display text-2xl">Rating breakdown · {activeSeason}</h2></div>
              <ComponentBreakdown comps={rating.data.components} />
            </>
          ) : <EmptyState title="INSUFFICIENT DATA">No rating components for this season.</EmptyState>}
          {stats.data && activeSeason != null && (
            <div className="grid gap-4 md:grid-cols-2">
              <MetricList title={`Advanced stats · ${activeSeason}`} sub="nflverse play-by-play & Pro Football Reference advanced tables" data={stats.data.advanced[activeSeason]} labels={ADV_LABELS} />
              <MetricList title={`Next Gen Stats · ${activeSeason}`} sub="NFL Next Gen Stats via nflverse (season aggregates)" data={stats.data.ngs[activeSeason]} />
            </div>
          )}
        </div>
      )}

      {tab === 'BIO' && <BioPanel p={p} />}
    </div>
  );
}

function MetricList({ title, sub, data, labels }: { title: string; sub: string; data: Record<string, number | null> | undefined; labels?: Record<string, string> }) {
  const entries = Object.entries(data ?? {}).filter(([k, v]) => v != null && (!labels || labels[k]));
  return (
    <div className="panel p-4">
      <div className="panel-hd">{title}</div>
      <div className="mb-3 text-[11px] text-fg-dim">{sub}</div>
      {entries.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 border-b border-white/[0.04] pb-1">
              <dt className="truncate text-xs text-fg-muted">{labels?.[k] ?? k.split('.').pop()!.replace(/_/g, ' ')}</dt>
              <dd className="tabular text-sm font-semibold">{fmt(v, Math.abs(v as number) < 10 && !Number.isInteger(v) ? 2 : Number.isInteger(v) ? 0 : 1)}</dd>
            </div>
          ))}
        </dl>
      ) : <div className="kicker">DATA UNAVAILABLE</div>}
    </div>
  );
}
