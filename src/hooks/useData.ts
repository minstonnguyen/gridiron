import { useQuery } from '@tanstack/react-query';
import { client } from '@/api/client';

const H = 60 * 60_000;
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: client.meta, staleTime: 5 * 60_000 });
export const useTeams = () => useQuery({ queryKey: ['teams'], queryFn: client.teams, staleTime: H });
export const useSeasonGames = (season: number | undefined) =>
  useQuery({ queryKey: ['games', season], queryFn: () => client.seasonGames(season!), enabled: season != null, staleTime: 5 * 60_000 });
export const useGame = (id: string) => useQuery({ queryKey: ['game', id], queryFn: () => client.game(id) });
export const useLineups = (id: string) => useQuery({ queryKey: ['lineups', id], queryFn: () => client.lineups(id), staleTime: 5 * 60_000 });
export const useMatchup = (id: string) => useQuery({ queryKey: ['matchup', id], queryFn: () => client.matchup(id), staleTime: 5 * 60_000 });
export const usePlayer = (id: string) => useQuery({ queryKey: ['player', id], queryFn: () => client.player(id), staleTime: 10 * 60_000 });
export const usePlayerStats = (id: string) => useQuery({ queryKey: ['pstats', id], queryFn: () => client.playerStats(id), staleTime: 10 * 60_000 });
export const usePlayerRating = (id: string, season?: number) =>
  useQuery({ queryKey: ['prating', id, season ?? 'latest'], queryFn: () => client.playerRating(id, season), staleTime: 10 * 60_000 });
export const useGameLog = (id: string, enabled = true) => useQuery({ queryKey: ['glog', id], queryFn: () => client.gameLog(id), enabled });
export const usePlayers = (season: number | undefined, position: string) =>
  useQuery({ queryKey: ['players', season, position], queryFn: () => client.players(season!, position), enabled: season != null, staleTime: 10 * 60_000 });
export const useTeam = (abbr: string, season: number | undefined) =>
  useQuery({ queryKey: ['team', abbr, season], queryFn: () => client.team(abbr, season!), enabled: season != null });
export const useRoster = (abbr: string, season: number | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['roster', abbr, season], queryFn: () => client.roster(abbr, season!), enabled: enabled && season != null });
export const useDepth = (abbr: string, season: number | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['depth', abbr, season], queryFn: () => client.depthChart(abbr, season!), enabled: enabled && season != null });
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: client.home, staleTime: 5 * 60_000 });
