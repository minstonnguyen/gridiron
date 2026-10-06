import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from '../lib/db.js';
import { clearCache } from '../lib/cache.js';
import type { AdminHealth, DatasetHealth } from '../../src/types/api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DATASETS: { key: string; label: string; table: string; ts: string }[] = [
  { key: 'players', label: 'Players', table: 'players', ts: 'updated_at' },
  { key: 'teams', label: 'Teams', table: 'teams', ts: 'updated_at' },
  { key: 'games', label: 'Games', table: 'games', ts: 'updated_at' },
  { key: 'rosters', label: 'Rosters', table: 'rosters', ts: 'updated_at' },
  { key: 'depth_charts', label: 'Depth Charts', table: 'depth_charts', ts: 'updated_at' },
  { key: 'injuries', label: 'Injuries', table: 'injuries', ts: 'updated_at' },
  { key: 'season_stats', label: 'Season Stats', table: 'player_season_stats', ts: 'updated_at' },
  { key: 'weekly_stats', label: 'Weekly Stats', table: 'player_weekly_stats', ts: 'updated_at' },
  { key: 'ngs', label: 'Next Gen Stats', table: 'next_gen_stats', ts: 'created_at' },
  { key: 'ratings', label: 'Ratings', table: 'player_ratings', ts: 'calculated_at' },
  { key: 'rating_components', label: 'Rating Components', table: 'player_rating_components', ts: 'created_at' },
  { key: 'bios', label: 'Bios', table: 'player_bios', ts: 'updated_at' },
];

export async function getHealth(): Promise<AdminHealth> {
  const datasets: DatasetHealth[] = [];
  const counts = await q<any>(DATASETS.map((d) => `SELECT '${d.key}' AS key, COUNT(*) AS n, MAX(${d.ts}) AS ts FROM ${d.table}`).join(' UNION ALL '));
  for (const d of DATASETS) {
    const c = counts.find((x) => x.key === d.key);
    const ts = c?.ts ? new Date(c.ts) : null;
    const stale = ts ? Date.now() - ts.getTime() > 8 * 86400_000 : false;
    datasets.push({ key: d.key, label: d.label, count: c?.n ?? 0, lastUpdated: ts?.toISOString() ?? null, status: !c?.n ? 'empty' : stale ? 'stale' : 'ok' });
  }
  const runs = await q<any>('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 40');
  const sources = await q<any>('SELECT dataset, part, synced_at, rows_upserted FROM sync_state ORDER BY synced_at DESC LIMIT 80');
  return {
    datasets,
    runs: runs.map((r) => ({ id: r.id, job: r.job, status: r.status, startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null, rows: r.rows_affected, message: r.message, log: r.log })),
    sources: sources.map((s) => ({ dataset: s.dataset, part: s.part, syncedAt: new Date(s.synced_at).toISOString(), rows: s.rows_upserted })),
  };
}

export const SYNC_JOBS: Record<string, string> = {
  all: 'all', players: 'players', games: 'games', rosters: 'rosters', 'depth-charts': 'depth-charts',
  injuries: 'injuries', stats: 'stats', ngs: 'ngs', ratings: 'ratings',
};

let running: string | null = null;

/** Runs the Python ingestion CLI server-side. Credentials stay in the server environment. */
export function runSync(job: string): { started: boolean; job: string; message: string } {
  const cli = SYNC_JOBS[job];
  if (!cli) return { started: false, job, message: 'unknown job' };
  if (running) return { started: false, job, message: `job '${running}' already running` };
  running = job;
  const child = spawn(process.env.PYTHON ?? 'python3', [path.join(ROOT, 'scripts/sync/sync.py'), cli], { cwd: ROOT, env: process.env, stdio: 'inherit' });
  child.on('exit', () => { running = null; clearCache(); });
  child.on('error', () => { running = null; });
  return { started: true, job, message: 'sync started; progress is recorded in sync_runs' };
}
