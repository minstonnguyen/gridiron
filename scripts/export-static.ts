/**
 * Static export for GitHub Pages.
 * Calls the SAME server service functions the Express API uses (against the same PostgreSQL database)
 * and writes their responses as JSON under dist/data/. The React app in VITE_DATA_MODE=static reads these.
 *
 *   EXPORT_SEASONS=2016-2026  (default: all seasons in the DB)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q } from '../server/lib/db.js';
import { getGame, getMeta, listGames } from '../server/services/games.js';
import { getLineups } from '../server/services/lineups.js';
import { computeMatchup, gameInjuries } from '../server/services/matchup.js';
import { getGameLog, getPlayer, getPlayerRatingsAll, getPlayerStats, listPlayers } from '../server/services/players.js';
import { listTeams } from '../server/services/teams.js';
import { getTeamDepthChart, getTeamDetail, getTeamRoster } from '../server/services/teamDetail.js';
import { getHome } from '../server/services/home.js';
import { getHealth } from '../server/services/admin.js';
import type { GameLogRow, PlayerListItem, PlayersPage } from '../src/types/api.js';
import { LOG_COLS, statGroup, trendKeys } from '../src/lib/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'data');
let files = 0, bytes = 0;

async function write(rel: string, data: unknown) {
  const p = path.join(OUT, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const s = JSON.stringify(data);
  await fs.writeFile(p, s);
  files++; bytes += s.length;
}

async function pool_<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>, label: string) {
  let i = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k], k);
      if (++done % 500 === 0) console.log(`  ${label}: ${done}/${items.length}`);
    }
  }));
  console.log(`  ${label}: ${items.length} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/** Drop null/undefined keys from flat stat rows (the client renders missing keys as "—"). */
const compact = <T extends Record<string, unknown>>(row: T) => Object.fromEntries(Object.entries(row).filter(([, v]) => v != null)) as T;

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  const meta = await getMeta();
  let seasons = meta.seasons;
  const env = process.env.EXPORT_SEASONS;
  if (env) {
    const [a, b] = env.split('-').map(Number);
    seasons = seasons.filter((s) => s >= a && s <= (b || a));
  }
  console.log(`Exporting seasons ${seasons.join(', ')}`);
  await write('meta.json', { ...meta, seasons, mode: 'static-export' });
  await write('home.json', await getHome());
  const teams = await listTeams();
  await write('teams.json', teams);
  await write('admin/health.json', await getHealth());

  // Games: schedule per season + one bundle per game (detail + lineups + matchup).
  for (const season of seasons) {
    const games = await listGames({ season });
    await write(`games/season-${season}.json`, games);
    await pool_(games, 6, async (g) => {
      const [detail, lineups] = await Promise.all([getGame(g.id), getLineups(g.id)]);
      const matchup = lineups ? computeMatchup(lineups, await gameInjuries(g.id, lineups)) : null;
      // Backups are not rendered by the matchup UI; omit them from the static bundle to keep Pages under its size limit.
      if (lineups) for (const side of [lineups.away, lineups.home]) for (const sl of [...side.offense, ...side.defense, ...side.specialists, ...(side.nickel ? [side.nickel] : [])]) sl.backups = [];
      await write(`games/${g.id}.json`, { detail, lineups, matchup });
    }, `games ${season}`);
  }

  // Player leaderboards per season/position, plus ALL — every player with a rating row
  // (rated first, then INSUFFICIENT DATA) so draft-class/team filters work client-side.
  for (const season of seasons) {
    for (const pos of [...POSITIONS, 'ALL']) {
      const items: PlayerListItem[] = [];
      let page = 1, total = 0;
      do {
        const r = await listPlayers({ season, position: pos === 'ALL' ? undefined : pos, page, pageSize: 200, rated: false });
        items.push(...r.items); total = r.total; page++;
      } while (items.length < total);
      const out: PlayersPage = { season, total: items.length, page: 1, pageSize: items.length, items };
      await write(`players/${season}/${pos}.json`, out);
    }
  }

  // Player bundles: everyone who appears on a roster in the exported seasons.
  const ids = await q<{ gsis_id: string }>(
    `SELECT DISTINCT p.gsis_id FROM players p JOIN rosters r ON r.player_id = p.id WHERE r.season = ANY($1) AND p.gsis_id IS NOT NULL`, [seasons]);
  await pool_(ids, 8, async ({ gsis_id }) => {
    const [profile, stats, ratings, log] = await Promise.all([getPlayer(gsis_id), getPlayerStats(gsis_id), getPlayerRatingsAll(gsis_id), getGameLog(gsis_id)]);
    if (!profile) return;
    const latest = profile.ratings.find((r) => r.overall != null)?.season ?? profile.ratings[0]?.season ?? null;
    // Per-season rating entries carry only rating + components; history/formula are rebuilt client-side from the profile.
    const slim = Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, { rating: v.rating, components: v.components }]));
    if (stats) stats.seasons = stats.seasons.map(compact);
    await write(`players/${gsis_id}.json`, { profile, stats, ratings: slim, latestSeason: latest });
    // Keep only the stat columns the UI renders for this player's position group(s).
    const groups = new Set([statGroup(profile.position), ...profile.ratings.map((r) => statGroup(r.position))]);
    const keep = new Set<string>(['season', 'week', 'seasonType', 'gameId', 'team', 'opp', 'home', 'result', 'gameScore']);
    for (const g of groups) {
      for (const c of LOG_COLS[g]) keep.add(c.key);
      const t = trendKeys(g); keep.add(t.prod); if (t.epa) keep.add(t.epa);
    }
    const slimLog = (log ?? []).map((row) => compact(Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k))) as GameLogRow));
    await write(`players/${gsis_id}/log.json`, slimLog);
  }, 'players');

  // Teams per season.
  const jobs = teams.flatMap((t) => seasons.map((s) => ({ t: t.abbr, s })));
  await pool_(jobs, 6, async ({ t, s }) => {
    const [detail, roster, depth] = await Promise.all([getTeamDetail(t, s), getTeamRoster(t, s), getTeamDepthChart(t, s)]);
    await write(`teams/${t}/${s}/detail.json`, detail);
    await write(`teams/${t}/${s}/roster.json`, roster ?? []);
    await write(`teams/${t}/${s}/depth.json`, depth ?? { season: s, week: null, source: null, entries: [] });
  }, 'teams');

  // Search index shards (by first letter of each name token). Latest rating per player.
  const rows = await q<any>(`
    SELECT DISTINCT ON (p.id) p.gsis_id AS id, p.display_name AS name, p.position, r.rating_position, t.abbreviation AS team, t.primary_color,
           p.headshot_url, p.jersey_number, r.overall_score, r.tier, r.confidence, r.position_rank
      FROM players p
      JOIN rosters ro ON ro.player_id = p.id AND ro.season = ANY($1)
      LEFT JOIN teams t ON t.id = p.latest_team_id
      LEFT JOIN player_ratings r ON r.player_id = p.id
     WHERE p.gsis_id IS NOT NULL
     ORDER BY p.id, r.season DESC NULLS LAST`, [seasons]);
  const shards: Record<string, unknown[]> = {};
  for (const r of rows) {
    const s = String(r.name).toLowerCase();
    const entry = {
      id: r.id, name: r.name, position: r.position, ratingPosition: r.rating_position, team: r.team, teamPrimary: r.primary_color, headshot: r.headshot_url,
      jersey: r.jersey_number, overall: r.overall_score, tier: r.tier, confidence: r.confidence, positionRank: r.position_rank, s,
    };
    const letters = new Set(String(r.name).toLowerCase().split(/[\s.'-]+/).filter(Boolean).map((w: string) => (/[a-z]/.test(w[0]) ? w[0] : '_')));
    for (const l of letters) (shards[l] ??= []).push(entry);
  }
  for (const [l, list] of Object.entries(shards)) await write(`search/${l}.json`, list);

  console.log(`Static export complete: ${files} files, ${(bytes / 1e6).toFixed(1)} MB → ${path.relative(ROOT, OUT)}`);
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
