import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import { getGame, getMeta, listGames } from '../services/games.js';
import { getLineups } from '../services/lineups.js';
import { getMatchup } from '../services/matchup.js';
import { getGameLog, getPlayer, getPlayerRating, getPlayerStats, listPlayers } from '../services/players.js';
import { listTeams } from '../services/teams.js';
import { getTeamDepthChart, getTeamDetail, getTeamRoster } from '../services/teamDetail.js';
import { search } from '../services/search.js';
import { getHome } from '../services/home.js';
import { getHealth, runSync } from '../services/admin.js';

const int = (v: unknown) => (v == null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

type Handler = (req: Request) => Promise<unknown>;
const h = (fn: Handler, maxAge = 60) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await fn(req);
    if (data == null) return res.status(404).json({ error: 'not_found', message: 'No data found for this request.' });
    res.set('Cache-Control', `public, max-age=${maxAge}`);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(403).json({ error: 'admin_disabled', message: 'Set ADMIN_TOKEN on the server to enable admin routes.' });
  const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const ok = given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function createApp() {
  const app = express();
  app.use(compression());
  app.use(express.json());

  app.get('/api/meta', h(() => getMeta()));
  app.get('/api/home', h(() => getHome()));
  app.get('/api/games', h((r) => listGames({ season: int(r.query.season), week: int(r.query.week), team: str(r.query.team), date: str(r.query.date) })));
  app.get('/api/games/:id', h((r) => getGame(r.params.id)));
  app.get('/api/games/:id/lineups', h((r) => getLineups(r.params.id)));
  app.get('/api/games/:id/matchup', h((r) => getMatchup(r.params.id)));
  app.get('/api/players', h((r) => listPlayers({ season: int(r.query.season), position: str(r.query.position), team: str(r.query.team), q: str(r.query.q), page: int(r.query.page), pageSize: int(r.query.pageSize), draftYear: int(r.query.draftYear), rated: r.query.rated === 'false' ? false : undefined })));
  app.get('/api/players/:id', h((r) => getPlayer(r.params.id), 300));
  app.get('/api/players/:id/stats', h((r) => getPlayerStats(r.params.id), 300));
  app.get('/api/players/:id/rating', h((r) => getPlayerRating(r.params.id, int(r.query.season)), 300));
  app.get('/api/players/:id/game-log', h((r) => getGameLog(r.params.id, int(r.query.season)), 300));
  app.get('/api/teams', h(() => listTeams(), 3600));
  app.get('/api/teams/:id', h((r) => getTeamDetail(r.params.id, int(r.query.season))));
  app.get('/api/teams/:id/roster', h((r) => getTeamRoster(r.params.id, int(r.query.season))));
  app.get('/api/teams/:id/depth-chart', h((r) => getTeamDepthChart(r.params.id, int(r.query.season), int(r.query.week))));
  app.get('/api/search', h((r) => search(String(r.query.q ?? ''), int(r.query.limit) ?? 8), 30));

  app.get('/api/admin/health', requireAdmin, h(() => getHealth(), 0));
  const jobs: Record<string, string> = {
    'sync/all': 'all', 'sync/players': 'players', 'sync/games': 'games', 'sync/rosters': 'rosters',
    'sync/depth-charts': 'depth-charts', 'sync/injuries': 'injuries', 'sync/stats': 'stats', 'sync/ngs': 'ngs',
    'ratings/recalculate': 'ratings',
  };
  for (const [route, job] of Object.entries(jobs)) {
    app.post(`/api/admin/${route}`, requireAdmin, (_req, res) => {
      const r = runSync(job);
      res.status(r.started ? 202 : 409).json(r);
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown API route.' }));
  app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const db = err.code === 'ECONNREFUSED' || /^(08|57|53)/.test(err.code ?? '');
    res.status(db ? 503 : 500).json({ error: db ? 'database_unavailable' : 'server_error', message: db ? 'The database is unavailable.' : 'Unexpected server error.' });
  });
  return app;
}
