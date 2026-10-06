import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, ExternalLink, KeyRound, Play, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { client, DATA_MODE } from '@/api/client';
import { EmptyState, ErrorState, PageLoading } from '@/components/States';
import { fmt } from '@/lib/format';

const ACTIONS = [
  { route: 'sync/all', label: 'SYNC ALL', job: 'all' },
  { route: 'sync/players', label: 'SYNC PLAYERS', job: 'players' },
  { route: 'sync/games', label: 'SYNC GAMES', job: 'games' },
  { route: 'sync/rosters', label: 'SYNC ROSTERS', job: 'rosters' },
  { route: 'sync/depth-charts', label: 'SYNC DEPTH CHARTS', job: 'depth-charts' },
  { route: 'sync/injuries', label: 'SYNC INJURIES', job: 'injuries' },
  { route: 'sync/stats', label: 'SYNC STATS', job: 'stats' },
  { route: 'sync/ngs', label: 'SYNC NEXT GEN STATS', job: 'ngs' },
  { route: 'ratings/recalculate', label: 'RECALCULATE RATINGS', job: 'ratings' },
];
const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? '';

export default function AdminData() {
  const [token, setToken] = useState(() => sessionStorage.getItem('gridiron_admin') ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const staticMode = DATA_MODE === 'static';
  const health = useQuery({ queryKey: ['admin-health', token], queryFn: () => client.adminHealth(token), enabled: staticMode || !!token, retry: false });

  const run = async (route: string) => {
    setMsg(null);
    try { const r = await client.adminRun(route, token); setMsg(r.message); setTimeout(() => health.refetch(), 1500); }
    catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kicker">ADMIN</div><h1 className="display text-5xl">Data health</h1></div>
        <span className={clsx('kicker rounded border px-2 py-1', staticMode ? 'border-[#ffd166]/40 text-[#ffd166]' : 'border-[#5cf2a0]/40 text-[#5cf2a0]')}>
          {staticMode ? 'STATIC EXPORT · READ-ONLY' : 'LIVE API'}
        </span>
      </header>

      {staticMode ? (
        <div className="panel space-y-2 p-4 text-sm text-fg-muted">
          <p>This site is a static export hosted on GitHub Pages. Ingestion runs server-side in GitHub Actions (PostgreSQL service container + Python nflverse sync), then the database is exported to JSON and deployed. No credentials ever reach the browser.</p>
          <p>To run a sync, trigger the <b className="text-fg">Sync & Deploy</b> workflow (choose a job) from the repository's Actions tab. Only repository maintainers can trigger it.</p>
          {REPO && <a href={`https://github.com/${REPO}/actions/workflows/deploy.yml`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ice hover:underline">Open workflow <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
      ) : (
        <form className="panel flex flex-wrap items-center gap-3 p-4" onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem('gridiron_admin', token); health.refetch(); }}>
          <KeyRound className="h-4 w-4 text-fg-muted" />
          <label htmlFor="tok" className="kicker">ADMIN TOKEN</label>
          <input id="tok" type="password" value={token} onChange={(e) => setToken(e.target.value)} className="min-w-[240px] flex-1 rounded-md border border-line bg-ink-800 px-3 py-2" autoComplete="off" />
          <button className="rounded-md bg-ice px-4 py-2 font-display font-bold tracking-wider text-ink-950">UNLOCK</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ACTIONS.map((a) => (
          <button key={a.route} disabled={staticMode || !token} onClick={() => run(a.route)} title={staticMode ? 'Run via GitHub Actions (static hosting)' : undefined}
            className="flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-800 px-3 py-3 font-display text-sm font-bold tracking-wider transition hover:border-ice/50 disabled:cursor-not-allowed disabled:opacity-40">
            {a.job === 'ratings' ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}{a.label}
          </button>
        ))}
      </div>
      {msg && <div className="panel p-3 text-sm" role="status">{msg}</div>}

      {!staticMode && !token ? <EmptyState title="LOCKED" icon={<KeyRound className="h-6 w-6 text-fg-dim" />}>Admin routes require the server's ADMIN_TOKEN.</EmptyState>
        : health.isLoading ? <PageLoading /> : health.isError ? <ErrorState error={health.error} onRetry={() => health.refetch()} /> : health.data && (
          <>
            <section className="panel scrollbar-thin overflow-x-auto" aria-label="Datasets">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-line">{['DATASET', 'RECORDS', 'LAST UPDATED', 'STATUS'].map((h) => <th key={h} scope="col" className="kicker px-4 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {health.data.datasets.map((d) => (
                    <tr key={d.key} className="border-b border-white/[0.04]">
                      <td className="flex items-center gap-2 px-4 py-2 font-semibold"><Database className="h-4 w-4 text-fg-dim" />{d.label}</td>
                      <td className="tabular px-4 py-2">{fmt(d.count)}</td>
                      <td className="px-4 py-2 text-fg-muted">{d.lastUpdated ? new Date(d.lastUpdated).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2"><span className={clsx('kicker', d.status === 'ok' ? 'text-[#5cf2a0]' : d.status === 'stale' ? 'text-[#ffd166]' : 'text-[#ff6b7a]')}>{d.status.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="space-y-2" aria-label="Sync logs">
              <h2 className="display text-2xl">Sync runs</h2>
              <div className="panel divide-y divide-white/5">
                {health.data.runs.length ? health.data.runs.map((r) => (
                  <details key={r.id} className="group px-4 py-2">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                      <span className={clsx('kicker w-16', r.status === 'success' ? 'text-[#5cf2a0]' : r.status === 'running' ? 'text-ice' : 'text-[#ff6b7a]')}>{r.status.toUpperCase()}</span>
                      <span className="font-semibold">{r.job}</span>
                      <span className="text-fg-muted">{new Date(r.startedAt).toLocaleString()}</span>
                      <span className="ml-auto tabular text-fg-dim">{r.rows != null ? `${fmt(r.rows)} rows` : ''}</span>
                    </summary>
                    {(r.message || r.log) && <pre className="scrollbar-thin mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-ink-950 p-3 text-xs text-fg-muted">{[r.message, r.log].filter(Boolean).join('\n')}</pre>}
                  </details>
                )) : <div className="kicker p-4">NO SYNC RUNS RECORDED</div>}
              </div>
            </section>
            <section className="space-y-2" aria-label="Source files">
              <h2 className="display text-2xl">Source files</h2>
              <div className="panel scrollbar-thin max-h-80 overflow-auto p-2 text-xs">
                {health.data.sources.map((s) => (
                  <div key={s.dataset + s.part} className="flex gap-3 px-2 py-1"><span className="w-40 font-semibold">{s.dataset}</span><span className="w-24 text-fg-muted">{s.part}</span><span className="text-fg-dim">{new Date(s.syncedAt).toLocaleString()}</span><span className="ml-auto tabular">{s.rows != null ? fmt(s.rows) : ''}</span></div>
                ))}
              </div>
            </section>
          </>
        )}
    </div>
  );
}
