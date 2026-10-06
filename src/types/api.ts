// Shared API contracts (server services <-> React client). Every field is sourced from PostgreSQL.

export type Tier =
  | 'GENERATIONAL' | 'ELITE' | 'STAR' | 'ABOVE AVERAGE' | 'AVERAGE' | 'BELOW AVERAGE' | 'DEVELOPING' | 'INSUFFICIENT DATA';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type GameStatus = 'scheduled' | 'final' | 'awaiting_result' | 'in_progress';

export interface TeamLite {
  id: number;
  abbr: string;
  name: string;
  nickname: string | null;
  city: string | null;
  conference: string | null;
  division: string | null;
  logo: string | null;
  wordmark: string | null;
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  stadium: string | null;
}

export interface TeamRecord { wins: number; losses: number; ties: number }

export interface GameSide {
  abbr: string;
  name: string;
  nickname: string | null;
  logo: string | null;
  primary: string | null;
  secondary: string | null;
  score: number | null;
  record: TeamRecord | null; // record entering this game (completed prior games of that season)
}

export interface GameSummary {
  id: string; // nflverse game_id
  season: number;
  week: number;
  seasonType: 'REG' | 'POST';
  gameType: string | null;
  date: string; // YYYY-MM-DD
  kickoff: string | null; // ISO
  weekday: string | null;
  status: GameStatus;
  stadium: string | null;
  roof: string | null;
  surface: string | null;
  overtime: boolean | null;
  away: GameSide;
  home: GameSide;
}

export interface RatingSummary {
  season: number;
  position: string;
  overall: number | null;
  tier: Tier;
  confidence: Confidence;
  positionScore: number | null; // percentile among same position (0-100)
  positionRank: number | null;
  positionCount: number | null;
  efficiency: number | null;
  advanced: number | null;
  production: number | null;
  consistency: number | null;
  recentForm: number | null;
  gamesSample: number | null;
  fromPriorSeason?: boolean;
}

export interface KeyStat { label: string; value: string }

export interface PlayerStatus {
  code: 'HEALTHY' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'INACTIVE' | 'RESERVE' | 'UNAVAILABLE';
  label: string;
  gameStatus: string | null;
  practice: string | null;
  injury: string | null;
  week: number | null;
}

export interface PlayerCardData {
  id: string; // gsis_id
  name: string;
  firstName: string | null;
  lastName: string | null;
  position: string; // slot / roster position
  ratingPosition: string | null;
  jersey: number | null;
  headshot: string | null;
  team: string | null;
  depth: number | null;
  starterLabel: 'PROJECTED STARTER' | 'DEPTH' | null;
  rating: RatingSummary | null;
  status: PlayerStatus;
  season: { season: number; games: number | null; starts: number | null; snaps: number | null; key: KeyStat[] } | null;
  recent: { week: number; score: number | null; opp: string | null }[];
  college: string | null;
  experience: number | null;
  draft: string | null;
  bio: string | null;
  gameSnapPct: number | null; // share of unit snaps in THIS game (completed games only)
}

export interface Slot {
  key: string;
  label: string;
  player: PlayerCardData | null;
  backups: PlayerCardData[];
}

export interface TeamLineup {
  team: TeamLite;
  depthWeek: number | null;
  depthSeason: number | null;
  depthSource: string | null;
  snapshotAt: string | null;
  offense: Slot[];
  defense: Slot[];
  front: '3-4' | '4-3' | 'UNKNOWN';
  specialists: Slot[];
  nickel: Slot | null;
}

export interface LineupsResponse {
  gameId: string;
  label: 'PROJECTED STARTERS' | 'DEPTH CHART (ARCHIVED)';
  note: string;
  away: TeamLineup;
  home: TeamLineup;
}

export interface UnitEdge {
  unit: string;
  away: number | null;
  home: number | null;
  edge: 'away' | 'home' | 'even' | 'unavailable';
  margin: number | null;
  awayPlayers: string[];
  homePlayers: string[];
}

export interface KeyMatchup {
  title: string;
  offenseTeam: string;
  defenseTeam: string;
  offense: number | null;
  defense: number | null;
  edge: 'offense' | 'defense' | 'even' | 'unavailable';
  note: string;
}

export interface MatchupResponse {
  gameId: string;
  label: 'ANALYTICS MATCHUP EDGE';
  disclaimer: string;
  units: UnitEdge[];
  overall: { away: number | null; home: number | null; edge: 'away' | 'home' | 'even' | 'unavailable'; margin: number | null };
  keyMatchups: KeyMatchup[];
  watch: PlayerCardData[];
  injuries: { away: PlayerCardData[]; home: PlayerCardData[] };
}

export interface GameDetail {
  game: GameSummary;
  awayTeam: TeamLite;
  homeTeam: TeamLite;
  live: { available: false; reason: string };
  headToHead: GameSummary[];
}

export interface PlayerListItem {
  id: string;
  name: string;
  position: string | null;
  ratingPosition: string | null;
  team: string | null;
  teamPrimary: string | null;
  headshot: string | null;
  jersey: number | null;
  overall: number | null;
  tier: Tier | null;
  confidence: Confidence | null;
  positionRank: number | null;
}

export interface PlayersPage { season: number; total: number; page: number; pageSize: number; items: PlayerListItem[] }

export interface RatingComponent {
  component: string;
  metric: string;
  label: string;
  raw: number | null;
  percentile: number | null;
  weight: number | null;
  weighted: number | null;
  higherIsBetter: boolean;
  scope: string;
}

export interface PlayerProfile {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  positionGroup: string | null;
  jersey: number | null;
  height: number | null;
  weight: number | null;
  birthDate: string | null;
  age: number | null;
  college: string | null;
  experience: number | null;
  status: string | null;
  rookieSeason: number | null;
  draft: { year: number | null; round: number | null; pick: number | null; team: string | null };
  headshot: string | null;
  team: TeamLite | null;
  currentStatus: PlayerStatus;
  bio: { bio: string | null; career: string | null; college: string | null; draft: string | null } | null;
  ratings: RatingSummary[]; // all seasons, newest first
}

export interface SeasonStatLine {
  season: number;
  seasonType: string;
  team: string | null;
  [key: string]: number | string | null;
}

export interface PlayerStatsResponse {
  seasons: SeasonStatLine[];
  advanced: Record<string, Record<string, number | null>>; // season -> metric -> value
  ngs: Record<string, Record<string, number | null>>; // season -> metric -> value (week 0 aggregates)
}

export interface PlayerRatingResponse {
  rating: RatingSummary | null;
  components: RatingComponent[];
  history: RatingSummary[];
  formula: { weights: Record<string, number>; version: string };
}

export interface GameLogRow {
  season: number;
  week: number;
  seasonType: string;
  gameId: string | null;
  team: string | null;
  opp: string | null;
  home: boolean | null;
  result: string | null;
  gameScore: number | null;
  [key: string]: number | string | boolean | null;
}

export interface SearchResult {
  players: PlayerListItem[];
  teams: TeamLite[];
  games: GameSummary[];
}

export interface TeamDetail {
  team: TeamLite;
  season: number;
  record: TeamRecord;
  schedule: GameSummary[];
  topPlayers: PlayerListItem[];
  injuries: PlayerCardData[];
}

export interface RosterEntry extends PlayerListItem {
  rosterPosition: string | null;
  rosterStatus: string | null;
  week: number;
}

export interface DepthChartEntry { position: string; group: string; slot: number | null; depth: number; player: PlayerListItem }
export interface DepthChartResponse { season: number; week: number | null; source: string | null; entries: DepthChartEntry[] }

export interface MetaResponse {
  currentSeason: number;
  currentWeek: number | null;
  seasons: number[];
  weeksBySeason: Record<string, number[]>;
  generatedAt: string;
  mode: 'live-api' | 'static-export';
}

export interface HomeResponse {
  season: number;
  week: number | null;
  featured: { game: GameSummary; matchup: MatchupResponse | null } | null;
  today: GameSummary[];
  upcoming: GameSummary[];
  recent: GameSummary[];
  topPlayers: PlayerListItem[];
  biggestEdges: { game: GameSummary; edge: MatchupResponse['overall']; topUnit: UnitEdge | null }[];
}

export interface DatasetHealth { key: string; label: string; count: number; lastUpdated: string | null; status: 'ok' | 'empty' | 'stale' }
export interface SyncRun { id: number; job: string; status: string; startedAt: string; finishedAt: string | null; rows: number | null; message: string | null; log: string | null }
export interface AdminHealth { datasets: DatasetHealth[]; runs: SyncRun[]; sources: { dataset: string; part: string; syncedAt: string; rows: number | null }[] }
