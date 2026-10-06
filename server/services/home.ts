import { cached, TTL } from '../lib/cache.js';
import { getMeta, seasonGames } from './games.js';
import { getMatchup } from './matchup.js';
import { listPlayers } from './players.js';
import type { HomeResponse, MatchupResponse } from '../../src/types/api.js';

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export function getHome(): Promise<HomeResponse> {
  return cached('home', TTL.schedule, async () => {
    const meta = await getMeta();
    const S = meta.currentSeason, W = meta.currentWeek;
    const games = await seasonGames(S);
    const today = games.filter((g) => g.date === todayET());
    const upcoming = games.filter((g) => g.status !== 'final').slice(0, 10);
    const recent = games.filter((g) => g.status === 'final').slice(-8).reverse();
    const weekGames = games.filter((g) => g.week === W && g.status !== 'final');
    const pool = weekGames.length ? weekGames : upcoming.slice(0, 16);
    const matchups: { game: (typeof games)[number]; m: MatchupResponse | null }[] = [];
    for (const g of pool) matchups.push({ game: g, m: await getMatchup(g.id) });
    const scored = matchups.filter((x) => x.m?.overall.away != null && x.m?.overall.home != null);
    const featured = [...scored].sort((a, b) => (b.m!.overall.away! + b.m!.overall.home!) - (a.m!.overall.away! + a.m!.overall.home!))[0]
      ?? (pool[0] ? { game: pool[0], m: null } : null);
    const biggestEdges = [...scored]
      .sort((a, b) => Math.abs(b.m!.overall.margin ?? 0) - Math.abs(a.m!.overall.margin ?? 0))
      .slice(0, 6)
      .map((x) => ({
        game: x.game, edge: x.m!.overall,
        topUnit: [...x.m!.units].filter((u) => u.margin != null).sort((a, b) => Math.abs(b.margin!) - Math.abs(a.margin!))[0] ?? null,
      }));
    // Position leaders: the top-rated player at each position (ratings are percentiles within position).
    const leaders = async (season: number) => (await Promise.all(
      ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DL', 'LB', 'CB', 'S'].map((pos) => listPlayers({ season, position: pos, pageSize: 1 })),
    )).flatMap((r) => r.items);
    let topItems = await leaders(S);
    if (!topItems.length) topItems = await leaders(S - 1);
    const top = { items: topItems };
    return {
      season: S, week: W,
      featured: featured ? { game: featured.game, matchup: featured.m } : null,
      today, upcoming, recent, topPlayers: top.items, biggestEdges,
    };
  });
}
