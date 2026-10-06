export interface Col { key: string; label: string; d?: number; title?: string }

type Group = 'QB' | 'RB' | 'REC' | 'OL' | 'DEF' | 'K' | 'P';

export function statGroup(pos: string | null | undefined): Group {
  switch (pos) {
    case 'QB': return 'QB';
    case 'RB': case 'FB': return 'RB';
    case 'WR': case 'TE': return 'REC';
    case 'OL': case 'T': case 'G': case 'C': case 'OT': case 'OG': return 'OL';
    case 'K': return 'K';
    case 'P': return 'P';
    default: return 'DEF';
  }
}

export const SEASON_COLS: Record<Group, Col[]> = {
  QB: [
    { key: 'games', label: 'G' }, { key: 'starts', label: 'GS' }, { key: 'passing_completions', label: 'CMP' }, { key: 'passing_attempts', label: 'ATT' },
    { key: 'completion_percentage', label: 'CMP%', d: 1 }, { key: 'passing_yards', label: 'YDS' }, { key: 'passing_tds', label: 'TD' },
    { key: 'interceptions', label: 'INT' }, { key: 'sacks', label: 'SK' }, { key: 'pass_epa_per_play', label: 'EPA/P', d: 3, title: 'Expected points added per pass play' },
    { key: 'passing_cpoe', label: 'CPOE', d: 1, title: 'Completion % over expected' }, { key: 'rushing_yards', label: 'RUSH YDS' }, { key: 'rushing_tds', label: 'RUSH TD' },
  ],
  RB: [
    { key: 'games', label: 'G' }, { key: 'starts', label: 'GS' }, { key: 'rushing_attempts', label: 'ATT' }, { key: 'rushing_yards', label: 'YDS' },
    { key: 'yards_per_carry', label: 'YPC', d: 1 }, { key: 'rushing_tds', label: 'TD' }, { key: 'targets', label: 'TGT' }, { key: 'receptions', label: 'REC' },
    { key: 'receiving_yards', label: 'REC YDS' }, { key: 'receiving_tds', label: 'REC TD' }, { key: 'rush_epa', label: 'RUSH EPA', d: 1 }, { key: 'fumbles_lost', label: 'FL' },
  ],
  REC: [
    { key: 'games', label: 'G' }, { key: 'starts', label: 'GS' }, { key: 'targets', label: 'TGT' }, { key: 'receptions', label: 'REC' },
    { key: 'receiving_yards', label: 'YDS' }, { key: 'yards_per_reception', label: 'Y/R', d: 1 }, { key: 'receiving_tds', label: 'TD' },
    { key: 'receiving_yac', label: 'YAC' }, { key: 'receiving_epa', label: 'REC EPA', d: 1 }, { key: 'fumbles_lost', label: 'FL' },
  ],
  OL: [
    { key: 'games', label: 'G' }, { key: 'starts', label: 'GS' }, { key: 'offense_snaps', label: 'OFF SNAPS' }, { key: 'st_snaps', label: 'ST SNAPS' }, { key: 'penalties', label: 'PEN' },
  ],
  DEF: [
    { key: 'games', label: 'G' }, { key: 'starts', label: 'GS' }, { key: 'defense_snaps', label: 'SNAPS' }, { key: 'tackles', label: 'TKL' },
    { key: 'solo_tackles', label: 'SOLO' }, { key: 'tackles_for_loss', label: 'TFL', d: 1 }, { key: 'sacks_defense', label: 'SACK', d: 1 },
    { key: 'qb_hits', label: 'QBH' }, { key: 'interceptions_defense', label: 'INT' }, { key: 'passes_defended', label: 'PD' }, { key: 'forced_fumbles', label: 'FF' },
  ],
  K: [{ key: 'games', label: 'G' }, { key: 'fg_made', label: 'FGM' }, { key: 'fg_att', label: 'FGA' }, { key: 'fg_long', label: 'LNG' }, { key: 'pat_made', label: 'XPM' }, { key: 'pat_att', label: 'XPA' }],
  P: [{ key: 'games', label: 'G' }, { key: 'punts', label: 'PUNTS' }, { key: 'punt_yards', label: 'YDS' }, { key: 'punt_net_yards', label: 'NET YDS' }, { key: 'punts_inside_20', label: 'IN 20' }],
};

export const LOG_COLS: Record<Group, Col[]> = {
  QB: [
    { key: 'passing_completions', label: 'CMP' }, { key: 'passing_attempts', label: 'ATT' }, { key: 'passing_yards', label: 'YDS' }, { key: 'passing_tds', label: 'TD' },
    { key: 'interceptions', label: 'INT' }, { key: 'sacks', label: 'SK' }, { key: 'passing_epa', label: 'EPA', d: 1 }, { key: 'passing_cpoe', label: 'CPOE', d: 1 },
    { key: 'rushing_yards', label: 'RUSH' }, { key: 'offense_pct', label: 'SNAP%', d: 0 },
  ],
  RB: [
    { key: 'rushing_attempts', label: 'ATT' }, { key: 'rushing_yards', label: 'YDS' }, { key: 'rushing_tds', label: 'TD' }, { key: 'targets', label: 'TGT' },
    { key: 'receptions', label: 'REC' }, { key: 'receiving_yards', label: 'REC YDS' }, { key: 'rushing_epa', label: 'EPA', d: 1 }, { key: 'offense_pct', label: 'SNAP%' },
  ],
  REC: [
    { key: 'targets', label: 'TGT' }, { key: 'receptions', label: 'REC' }, { key: 'receiving_yards', label: 'YDS' }, { key: 'receiving_tds', label: 'TD' },
    { key: 'receiving_yac', label: 'YAC' }, { key: 'receiving_epa', label: 'EPA', d: 1 }, { key: 'offense_pct', label: 'SNAP%' },
  ],
  OL: [{ key: 'offense_snaps', label: 'SNAPS' }, { key: 'offense_pct', label: 'SNAP%' }, { key: 'st_snaps', label: 'ST' }],
  DEF: [
    { key: 'defense_snaps', label: 'SNAPS' }, { key: 'solo_tackles', label: 'SOLO' }, { key: 'assisted_tackles', label: 'AST' }, { key: 'tackles_for_loss', label: 'TFL', d: 1 },
    { key: 'sacks_defense', label: 'SACK', d: 1 }, { key: 'qb_hits', label: 'QBH' }, { key: 'pressures', label: 'PRSS' }, { key: 'interceptions_defense', label: 'INT' },
    { key: 'passes_defended', label: 'PD' }, { key: 'missed_tackles', label: 'MISS' },
  ],
  K: [{ key: 'fg_made', label: 'FGM' }, { key: 'fg_att', label: 'FGA' }, { key: 'pat_made', label: 'XPM' }, { key: 'pat_att', label: 'XPA' }],
  P: [{ key: 'punts', label: 'PUNTS' }, { key: 'punt_yards', label: 'YDS' }, { key: 'punt_net_yards', label: 'NET' }],
};

/** Per-game trend series used by the profile charts. */
export function trendKeys(g: Group): { epa: string | null; prod: string; prodLabel: string } {
  switch (g) {
    case 'QB': return { epa: 'passing_epa', prod: 'passing_yards', prodLabel: 'Passing yards' };
    case 'RB': return { epa: 'rushing_epa', prod: 'rushing_yards', prodLabel: 'Rushing yards' };
    case 'REC': return { epa: 'receiving_epa', prod: 'receiving_yards', prodLabel: 'Receiving yards' };
    case 'OL': return { epa: null, prod: 'offense_snaps', prodLabel: 'Offensive snaps' };
    case 'K': return { epa: null, prod: 'fg_made', prodLabel: 'Field goals made' };
    case 'P': return { epa: null, prod: 'punt_net_yards', prodLabel: 'Net punt yards' };
    default: return { epa: null, prod: 'solo_tackles', prodLabel: 'Solo tackles' };
  }
}

export const ADV_LABELS: Record<string, string> = {
  epa_per_dropback: 'EPA per dropback', pass_success_rate: 'Pass success rate %', on_target_pct: 'On-target throw %', bad_throw_pct: 'Bad-throw %',
  pressure_pct: 'Pressured %', pocket_time: 'Pocket time (s)', times_pressured: 'Times pressured', dropbacks: 'Dropbacks', drop_pct_qb: 'Receiver drop %',
  rush_success_rate: 'Rush success rate %', rush_explosive_rate: 'Explosive rush %', rush_stuff_rate: 'Stuffed rush %', broken_tackles_rush: 'Broken tackles (rush)',
  ybc_per_att: 'Yards before contact / att', yac_per_att: 'Yards after contact / att', att_per_broken_tackle: 'Att per broken tackle',
  target_success_rate: 'Target success rate %', rec_explosive_rate: 'Explosive catch %', adot: 'Avg depth of target', drops: 'Drops', drop_pct: 'Drop %',
  broken_tackles_rec: 'Broken tackles (rec)', ybc_per_rec: 'Yards before catch / rec', yac_per_rec: 'YAC / rec', passer_rating_when_targeted: 'Passer rating when targeted',
  pressures: 'Pressures', hurries: 'Hurries', qb_knockdowns: 'QB knockdowns', blitzes: 'Blitzes', missed_tackles: 'Missed tackles', missed_tackle_pct: 'Missed tackle %',
  targets_allowed: 'Targets allowed', completions_allowed: 'Completions allowed', yards_allowed: 'Yards allowed', yards_per_target_allowed: 'Yards / target allowed',
  completion_pct_allowed: 'Completion % allowed', passer_rating_allowed: 'Passer rating allowed', tds_allowed: 'TDs allowed', def_stops: 'Defensive stops',
  air_yards_share: 'Air yards share', target_share: 'Target share', wopr: 'WOPR', racr: 'RACR',
};
