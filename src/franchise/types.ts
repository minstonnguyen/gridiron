// ---------- Seed (static JSON exported by scripts/franchise/export_seed.py) ----------
export type PosGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'IOL' | 'EDGE' | 'IDL' | 'LB' | 'CB' | 'S' | 'K' | 'P' | 'LS';
export const POS_GROUPS: PosGroup[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'IDL', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

export type RosterList = 'active' | 'ps' | 'ps_intl' | 'ps_inj' | 'ir' | 'ir_return' | 'pup' | 'nfi' | 'fa' | 'waivers';

export interface ContractYear {
  year: number; base: number; prorated: number; roster: number; option: number; guaranteed: number; cap: number; other: number; void: boolean;
}
export interface Contract {
  src: 'otc' | 'est_min' | 'save';
  signed: number | null; years_total: number | null; value: number | null; apy: number | null; guaranteed_total: number | null;
  apy_cap_pct?: number | null; type: string | null; team?: string | null; expires: number; years: ContractYear[];
}
export interface SeedPlayer {
  id: string; name: string; first: string | null; last: string | null; team: string | null; pos: string | null; listed_pos: string | null;
  group: PosGroup; status: RosterList; status_code: string | null; last_team?: string | null; last_roster_season?: number;
  jersey: number | null; birth: string | null; ht: number | null; wt: number | null; college: string | null; exp: number; rookie_season: number | null;
  draft: { year: number | null; round: number | null; pick: number | null; team: string | null } | null;
  headshot: string | null;
  rating: { season: number; pos: string | null; overall: number | null; confidence: number | null; tier: string | null; games: number | null } | null;
  pct: Record<string, number> | null;
  combine: Partial<Record<'forty' | 'bench' | 'vertical' | 'broad_jump' | 'cone' | 'shuttle', number | null>> | null;
  depth: { pos: string; depth: number | null; formation: string | null }[] | null;
  contract: Contract | null;
}
export interface SeedTeam {
  abbr: string; name: string; nickname: string; city: string; conf: 'AFC' | 'NFC'; div: string; logo: string | null; color: string | null; color2: string | null;
  stadium: string | null; head_coach: string | null; prev_season?: { season: number; games: number; point_diff: number } | null;
}
export interface SeedGame {
  id: string; week: number; type: string; date: string; kickoff: string | null; home: string; away: string; neutral: boolean; stadium: string | null; roof: string | null;
  result: { home: number; away: number; ot: boolean; real: boolean } | null;
}
export interface Seed {
  version: number; generated_at: string; season: number; roster_week: number; start_date: string; last_final_date: string | null;
  league: {
    salary_cap: number; salary_cap_source: string; min_salary: number[]; min_salary_source: string;
    ps_weekly: { standard: number; vet_min: number; vet_max: number };
    franchise_tag: Record<string, number>; transition_tag: Record<string, number>; tag_source: string; calendar_source: string;
  };
  teams: SeedTeam[]; players: SeedPlayer[]; schedule: SeedGame[];
}
export interface Calibration {
  generated_at: string;
  scoring: {
    seasons: string; games: number; team_points_hist: Record<string, number>; mean_team_points: number; sd_team_points: number; mean_total: number;
    home_win_rate: number; tie_rate: number; ot_rate: number; one_score_rate: number; mean_abs_margin: number; sd_team_win_pct: number; score_pairs?: Record<string, number>;
  };
  injuries: { definition: string; seasons: string; by_group: Record<string, { rate_per_game: number; exposures: number; episodes: number; duration_hist: Record<string, number>; mean_games_missed: number }> };
  injury_types: Record<string, Record<string, number>>;
  aging: { definition: string; by_group: Record<string, Record<string, { mean_delta: number; n: number }>> };
  draftHitRates?: any; pickValue?: any; combineDist?: any;
}

// ---------- Save state ----------
export interface Attr { key: string; label: string; v: number } // true value on the 1-20 scale (hidden)

export interface Player {
  id: string; name: string; first: string; last: string; team: string | null; list: RosterList; group: PosGroup; pos: string;
  jersey: number | null; birth: string | null; ht: number | null; wt: number | null; college: string | null; exp: number;
  draft: SeedPlayer['draft']; headshot: string | null;
  /** hidden truth */
  ca: number; pa: number; attrs: Record<string, number>; personality: Record<string, number>;
  /** evidence used to build the estimate (shown in profile) */
  basis: { rating: number | null; ratingSeason: number | null; games: number | null; apyPct: number | null; depthRank: number | null; draftValue: number | null; combine: boolean };
  contract: Contract | null;
  injury: { type: string; gamesOut: number; since: string; seasonEnding: boolean } | null;
  irGames: number; // games missed while on IR this season
  elevations: number; // practice-squad elevations used this season
  lastTeam?: string | null; lastSeason?: number; // last club per official rosters (free agents) or the club that released him
  psExempt?: boolean; // real PS player with 3+ seasons the league treats as non-veteran (e.g. <9 games/season exception)
  elevated: boolean;
  waiver?: { from: string; until: string; claims: string[] } | null;
  ask?: number | null; // free-agent salary ask ($M per season)
  vet: boolean; // vested veteran (4+ accrued seasons)
  history: { date: string; text: string }[];
}

export interface Staff { id: string; team: string; role: string; name: string; real: boolean; attrs: Record<string, number> }

export interface Game {
  id: string; week: number; type: 'REG' | 'WC' | 'DIV' | 'CON' | 'SB'; date: string; home: string; away: string; neutral: boolean;
  result: { home: number; away: number; ot: boolean; real: boolean } | null;
}

export interface Message {
  id: string; date: string; from: string; subject: string; body: string; read: boolean; kind: 'owner' | 'staff' | 'league' | 'medical' | 'result' | 'transaction' | 'system';
  link?: string; urgent?: boolean;
}

export interface NewsItem { id: string; date: string; headline: string; body?: string; team?: string }

export interface DeadMoney { player: string; name: string; team: string; year: number; amount: number; reason: string }

export interface Transaction { date: string; team: string; text: string }

export interface SaveMeta {
  id: string; name: string; team: string; coach: string; created: string; updated: string; date: string; ironman: boolean; seedGenerated: string; version: number;
}

export interface FranchiseState {
  meta: SaveMeta;
  seed: { generated_at: string; season: number; roster_week: number; start_date: string };
  rng: number[];
  date: string; // YYYY-MM-DD, league (New York) date
  season: number;
  phase: 'regular' | 'playoffs' | 'season_over';
  userTeam: string;
  teams: (SeedTeam & { prior: number })[];
  players: Record<string, Player>;
  depth: Record<string, Record<string, string[]>>; // team -> group -> ordered player ids
  userDepthLocked: boolean;
  inactives: Record<string, string[]>; // team -> player ids marked inactive for the next game (user team only)
  staff: Staff[];
  games: Game[];
  inbox: Message[];
  news: NewsItem[];
  dead: DeadMoney[];
  transactions: Transaction[];
  irReturns: Record<string, number>;
  settings: { assistantRoster: boolean };
  knowledge: Record<string, number>; // player id -> user's staff knowledge 0-100
  bias: Record<string, number>; // player id -> fixed estimate bias seed (-1..1)
  cap: number;
  league: Seed['league'];
  log: { date: string; text: string }[];
  playoffSeeds?: Record<'AFC' | 'NFC', string[]>;
}
