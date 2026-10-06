"""GRIDIRON ANALYTICS RATING (GAR) engine.

An original, explainable 0-100 rating computed only from public nflverse statistics.
It is NOT a PFF grade, Madden rating, or any official league rating.

Pipeline (per season, per position):
  1. Build each player's metric vector (position-specific; see METRICS).
  2. Players must clear a participation threshold scaled to weeks played -> otherwise INSUFFICIENT DATA.
  3. Every metric -> percentile among qualified players at the SAME position and season.
     Lower-is-better metrics are inverted. Missing metrics are omitted and their weight is
     redistributed proportionally inside the category (never imputed).
  4. Category scores = weighted mean of metric percentiles:
        efficiency 40% · advanced impact 25% · production 20% · consistency 10% · recent form 5%
     (categories with no data are dropped and the rest re-normalised).
  5. composite_raw = weighted blend (0-100). Overall = tier calibration of the composite's
     percentile rank (documented anchors below), clamped 0-100, rounded to 1 decimal.
  6. Every metric is persisted to player_rating_components with raw value, percentile and
     effective weight so each rating is fully explainable.
"""
from __future__ import annotations

import datetime as dt
import warnings

import numpy as np
import pandas as pd

from server.ingestion import db
from server.ingestion.config import RATING_VERSION, season_range

warnings.filterwarnings("ignore", message="pandas only supports SQLAlchemy")

CATEGORY_WEIGHTS = {"efficiency": 0.40, "advanced": 0.25, "production": 0.20, "consistency": 0.10, "recent_form": 0.05}

# Percentile -> rating anchors. Produces roughly: Generational ~2.5%, Elite ~6.5%, Star ~11%,
# Above Average ~15%, Average ~30%, Below Average ~20%, Developing ~15% of qualified players.
CAL_P = [0.0, 0.15, 0.35, 0.65, 0.80, 0.91, 0.975, 1.0]
CAL_R = [40.0, 60.0, 70.0, 80.0, 85.0, 90.0, 95.0, 99.0]

TIERS = [(95, "GENERATIONAL"), (90, "ELITE"), (85, "STAR"), (80, "ABOVE AVERAGE"), (70, "AVERAGE"),
         (60, "BELOW AVERAGE"), (0, "DEVELOPING")]


def tier_for(score):
    if score is None or (isinstance(score, float) and np.isnan(score)):
        return "INSUFFICIENT DATA"
    for floor, name in TIERS:
        if score >= floor:
            return name
    return "DEVELOPING"


def calibrate(p: pd.Series) -> pd.Series:
    return pd.Series(np.interp(p.astype(float), CAL_P, CAL_R), index=p.index).clip(0, 100).round(1)


# (key, label, category, weight, higher_is_better, scope)
M = tuple
METRICS: dict[str, list[M]] = {
    "QB": [
        ("epa_per_dropback", "EPA / dropback", "efficiency", 3, True, "player"),
        ("adj_yards_per_dropback", "Adj. yards / dropback", "efficiency", 2, True, "player"),
        ("pass_success_rate", "Dropback success rate", "efficiency", 2, True, "player"),
        ("completion_pct", "Completion %", "efficiency", 1, True, "player"),
        ("td_rate", "TD rate", "efficiency", 1, True, "player"),
        ("int_rate", "INT rate (avoidance)", "efficiency", 1, False, "player"),
        ("cpoe", "CPOE", "advanced", 3, True, "player"),
        ("pressure_to_sack", "Sacks / pressure (pressure performance)", "advanced", 2, False, "player"),
        ("on_target_pct", "On-target throw %", "advanced", 1, True, "player"),
        ("bad_throw_pct", "Bad-throw %", "advanced", 1, False, "player"),
        ("ngs_aggressiveness", "NGS aggressiveness", "advanced", 0.5, True, "player"),
        ("qb_rush_epa", "Rushing EPA", "advanced", 1, True, "player"),
        ("passing_yards", "Passing yards", "production", 2, True, "player"),
        ("passing_tds", "Passing TD", "production", 2, True, "player"),
        ("total_epa", "Total EPA", "production", 2, True, "player"),
        ("rushing_yards", "Rushing yards", "production", 1, True, "player"),
    ],
    "RB": [
        ("rush_epa_per_carry", "Rush EPA / carry", "efficiency", 3, True, "player"),
        ("rush_success_rate", "Rush success rate", "efficiency", 3, True, "player"),
        ("yards_per_carry", "Yards / carry", "efficiency", 2, True, "player"),
        ("fumble_rate", "Fumbles lost / touch", "efficiency", 1, False, "player"),
        ("ngs_rush_yards_over_expected_per_att", "NGS rush yards over expected / att", "advanced", 3, True, "player"),
        ("rush_explosive_rate", "Explosive run rate (10+)", "advanced", 2, True, "player"),
        ("broken_tackle_rate", "Broken tackles / touch", "advanced", 1, True, "player"),
        ("yac_per_att", "Yards after contact / att", "advanced", 1, True, "player"),
        ("rec_epa_per_target", "Receiving EPA / target", "advanced", 1, True, "player"),
        ("rushing_yards", "Rushing yards", "production", 2, True, "player"),
        ("scrimmage_yards", "Scrimmage yards", "production", 2, True, "player"),
        ("total_tds", "Total TD", "production", 1, True, "player"),
        ("receptions", "Receptions", "production", 1, True, "player"),
    ],
    "WR": [
        ("yards_per_target", "Yards / target", "efficiency", 3, True, "player"),
        ("rec_epa_per_target", "Receiving EPA / target", "efficiency", 3, True, "player"),
        ("target_success_rate", "Target success rate", "efficiency", 2, True, "player"),
        ("catch_rate", "Catch rate", "efficiency", 1, True, "player"),
        ("target_share", "Target share (avg)", "advanced", 2, True, "player"),
        ("yac_per_rec", "YAC / reception", "advanced", 1, True, "player"),
        ("ngs_avg_separation", "NGS avg separation", "advanced", 1, True, "player"),
        ("ngs_avg_yac_above_expectation", "NGS YAC over expected", "advanced", 1, True, "player"),
        ("rec_explosive_rate", "Explosive target rate (20+)", "advanced", 1, True, "player"),
        ("drop_pct", "Drop %", "advanced", 1, False, "player"),
        ("receiving_yards", "Receiving yards", "production", 3, True, "player"),
        ("receiving_tds", "Receiving TD", "production", 2, True, "player"),
        ("receptions", "Receptions", "production", 1, True, "player"),
        ("targets", "Targets", "production", 1, True, "player"),
    ],
    "OL": [
        ("penalty_rate", "Accepted penalties / 100 snaps", "efficiency", 2, False, "player"),
        ("team_sack_rate", "Team sack rate allowed", "efficiency", 2, False, "team"),
        ("team_rush_epa", "Team rush EPA / carry", "efficiency", 2, True, "team"),
        ("team_pressure_rate", "Team QB pressure rate allowed", "advanced", 2, False, "team"),
        ("team_rush_success", "Team rush success rate", "advanced", 1, True, "team"),
        ("offense_snaps", "Offensive snaps", "production", 3, True, "player"),
        ("snap_share", "Offensive snap share", "production", 2, True, "player"),
    ],
    "EDGE": [
        ("pressure_rate", "Pressures / 100 snaps", "efficiency", 3, True, "player"),
        ("sack_rate", "Sacks / 100 snaps", "efficiency", 2, True, "player"),
        ("stop_rate", "Run/pass stops / 100 snaps", "efficiency", 2, True, "player"),
        ("tfl_rate", "TFL / 100 snaps", "efficiency", 1, True, "player"),
        ("impact_epa_rate", "Defensive impact EPA / 100 snaps", "advanced", 2, True, "player"),
        ("qb_hit_rate", "QB hits / 100 snaps", "advanced", 1, True, "player"),
        ("hurry_rate", "Hurries / 100 snaps", "advanced", 1, True, "player"),
        ("missed_tackle_pct", "Missed tackle %", "advanced", 1, False, "player"),
        ("sacks_defense", "Sacks", "production", 2, True, "player"),
        ("pressures", "Pressures", "production", 2, True, "player"),
        ("tackles", "Tackles", "production", 1, True, "player"),
        ("tackles_for_loss", "Tackles for loss", "production", 1, True, "player"),
        ("forced_fumbles", "Forced fumbles", "production", 1, True, "player"),
    ],
    "LB": [
        ("stop_rate", "Stops / 100 snaps", "efficiency", 2, True, "player"),
        ("missed_tackle_pct", "Missed tackle %", "efficiency", 2, False, "player"),
        ("tackle_rate", "Tackles / 100 snaps", "efficiency", 1, True, "player"),
        ("yds_per_tgt_allowed", "Yards / target allowed", "efficiency", 1, False, "player"),
        ("impact_epa_rate", "Defensive impact EPA / 100 snaps", "advanced", 2, True, "player"),
        ("passer_rating_allowed", "Passer rating allowed", "advanced", 1, False, "player"),
        ("pressure_rate", "Pressures / 100 snaps", "advanced", 1, True, "player"),
        ("tackles", "Tackles", "production", 2, True, "player"),
        ("tackles_for_loss", "Tackles for loss", "production", 1, True, "player"),
        ("sacks_defense", "Sacks", "production", 1, True, "player"),
        ("passes_defended", "Passes defended", "production", 1, True, "player"),
        ("interceptions_defense", "Interceptions", "production", 1, True, "player"),
    ],
    "CB": [
        ("yds_per_tgt_allowed", "Yards / target allowed", "efficiency", 3, False, "player"),
        ("cmp_pct_allowed", "Completion % allowed", "efficiency", 2, False, "player"),
        ("passer_rating_allowed", "Passer rating allowed", "efficiency", 2, False, "player"),
        ("ball_skills_rate", "(PD + INT) / target", "advanced", 2, True, "player"),
        ("impact_epa_rate", "Defensive impact EPA / 100 snaps", "advanced", 2, True, "player"),
        ("missed_tackle_pct", "Missed tackle %", "advanced", 1, False, "player"),
        ("passes_defended", "Passes defended", "production", 2, True, "player"),
        ("interceptions_defense", "Interceptions", "production", 2, True, "player"),
        ("tackles", "Tackles", "production", 1, True, "player"),
        ("defense_snaps", "Defensive snaps", "production", 1, True, "player"),
    ],
    "S": [
        ("yds_per_tgt_allowed", "Yards / target allowed", "efficiency", 2, False, "player"),
        ("passer_rating_allowed", "Passer rating allowed", "efficiency", 2, False, "player"),
        ("stop_rate", "Stops / 100 snaps", "efficiency", 2, True, "player"),
        ("missed_tackle_pct", "Missed tackle %", "efficiency", 1, False, "player"),
        ("ball_skills_rate", "(PD + INT) / target", "advanced", 2, True, "player"),
        ("impact_epa_rate", "Defensive impact EPA / 100 snaps", "advanced", 2, True, "player"),
        ("tackles", "Tackles", "production", 2, True, "player"),
        ("interceptions_defense", "Interceptions", "production", 2, True, "player"),
        ("passes_defended", "Passes defended", "production", 1, True, "player"),
        ("defense_snaps", "Defensive snaps", "production", 1, True, "player"),
    ],
    "K": [
        ("fg_pct", "Field goal %", "efficiency", 3, True, "player"),
        ("fg50_pct", "50+ yd FG %", "efficiency", 2, True, "player"),
        ("pat_pct", "Extra point %", "efficiency", 1, True, "player"),
        ("avg_fg_made_distance", "Avg made FG distance", "advanced", 2, True, "player"),
        ("kickoff_touchback_rate", "Kickoff touchback %", "advanced", 1, True, "player"),
        ("fg_made", "Field goals made", "production", 2, True, "player"),
        ("kick_points", "Kicking points", "production", 1, True, "player"),
    ],
    "P": [
        ("net_avg", "Net average", "efficiency", 3, True, "player"),
        ("gross_avg", "Gross average", "efficiency", 2, True, "player"),
        ("inside20_rate", "Inside-20 %", "advanced", 2, True, "player"),
        ("punt_touchback_rate", "Touchback %", "advanced", 1, False, "player"),
        ("return_yds_per_punt", "Return yards / punt", "advanced", 1, False, "player"),
        ("punts", "Punts", "production", 1, True, "player"),
        ("punt_yards", "Punt yards", "production", 1, True, "player"),
    ],
}
METRICS["TE"] = METRICS["WR"]
METRICS["DL"] = METRICS["EDGE"]

POSITION_MAP = {
    "QB": "QB", "RB": "RB", "HB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
    "T": "OL", "OT": "OL", "G": "OL", "OG": "OL", "C": "OL", "OL": "OL", "LT": "OL", "RT": "OL", "LG": "OL", "RG": "OL",
    "DE": "EDGE", "EDGE": "EDGE", "DT": "DL", "NT": "DL", "DL": "DL",
    "ILB": "LB", "MLB": "LB", "LB": "LB", "OLB": "OLB",
    "CB": "CB", "DB": "CB", "FS": "S", "SS": "S", "S": "S", "SAF": "S",
    "K": "K", "PK": "K", "P": "P",
}


def _div(a, b, scale=1.0):
    a = pd.to_numeric(a, errors="coerce")
    b = pd.to_numeric(b, errors="coerce")
    with np.errstate(divide="ignore", invalid="ignore"):
        out = a / b.where(b > 0) * scale
    return out.replace([np.inf, -np.inf], np.nan)


def _load_season(season: int):
    c = db.conn()
    s = pd.read_sql(
        """SELECT s.*, p.position AS player_position, p.gsis_id FROM player_season_stats s
           JOIN players p ON p.id = s.player_id WHERE s.season = %(s)s AND s.season_type = 'REG'""",
        c, params={"s": season})
    if s.empty:
        return None
    adv = pd.json_normalize(s["advanced"].apply(lambda v: v if isinstance(v, dict) else {}))
    adv.index = s.index
    s = pd.concat([s.drop(columns=["advanced"]), adv.add_prefix("adv_")], axis=1)
    pos = pd.read_sql(
        """SELECT player_id, mode() WITHIN GROUP (ORDER BY COALESCE(NULLIF(depth_chart_position,''), position)) AS roster_pos
           FROM rosters WHERE season = %(s)s AND roster_status IN ('ACT','RES','INA') GROUP BY player_id""",
        c, params={"s": season})
    s = s.merge(pos, on="player_id", how="left")
    ngs = pd.read_sql(
        """SELECT player_id, metric_name, metric_value FROM next_gen_stats
           WHERE season=%(s)s AND week=0 AND season_type='REG'
             AND metric_name IN ('aggressiveness','rush_yards_over_expected_per_att','avg_separation','avg_yac_above_expectation')""",
        c, params={"s": season})
    if not ngs.empty:
        piv = ngs.pivot_table(index="player_id", columns="metric_name", values="metric_value", aggfunc="first").add_prefix("ngs_")
        s = s.merge(piv, left_on="player_id", right_index=True, how="left")
    team = pd.read_sql("SELECT team_id, indicators FROM team_season_indicators WHERE season=%(s)s", c, params={"s": season})
    if not team.empty:
        tj = pd.json_normalize(team["indicators"]).add_prefix("ti_")
        tj["team_id"] = team["team_id"].values
        s = s.merge(tj, on="team_id", how="left")
    weekly = pd.read_sql(
        """SELECT w.player_id, w.week, w.season_type, w.team_id, w.passing_attempts, w.sacks, w.passing_epa, w.passing_cpoe,
                  w.rushing_attempts, w.rushing_yards, w.rushing_epa, w.targets, w.receptions, w.receiving_yards,
                  w.receiving_epa, w.solo_tackles, w.assisted_tackles, w.tackles_for_loss, w.sacks_defense, w.qb_hits,
                  w.interceptions_defense, w.passes_defended, w.forced_fumbles, w.fg_made, w.fg_att, w.pat_made, w.pat_att,
                  w.punts, w.punt_net_yards, w.defense_snaps, w.offense_snaps, w.pressures, w.yards_allowed,
                  w.targets_allowed, w.passing_yards, w.passing_tds, w.interceptions, w.rushing_tds, w.receiving_tds,
                  (w.stats->>'fg_made_50_59')::float AS fg_made_50_59, (w.stats->>'fg_made_60_')::float AS fg_made_60,
                  (w.stats->>'fg_missed_50_59')::float AS fg_missed_50_59, (w.stats->>'fg_missed_60_')::float AS fg_missed_60,
                  (w.stats->>'fg_made_distance')::float AS fg_made_distance, (w.stats->>'pt_inside_20')::float AS pt_inside_20,
                  (w.stats->>'pt_touchback')::float AS pt_touchback, (w.stats->>'pt_return_yards')::float AS pt_return_yards,
                  (w.stats->>'target_share')::float AS target_share
           FROM player_weekly_stats w WHERE w.season = %(s)s""",
        c, params={"s": season})
    weeks_done = c.execute(
        "SELECT COUNT(DISTINCT week) FROM games WHERE season=%s AND season_type='REG' AND status='final'", (season,)
    ).fetchone()[0]
    return s, weekly, int(weeks_done or 0)


def col(s: pd.DataFrame, name: str) -> pd.Series:
    return pd.to_numeric(s[name], errors="coerce") if name in s.columns else pd.Series(np.nan, index=s.index)


def _assign_positions(s: pd.DataFrame) -> pd.Series:
    raw = s["roster_pos"].fillna(s["player_position"]).fillna("").str.upper()
    pos = raw.map(POSITION_MAP)
    # OLB: edge rusher vs off-ball LB decided by pass-rush production (pressures+sacks+hits per game)
    games = pd.to_numeric(s["games"], errors="coerce").replace(0, np.nan)
    rush = (col(s, "adv_pressures").fillna(0)
            + pd.to_numeric(s["sacks_defense"], errors="coerce").fillna(0)
            + pd.to_numeric(s["qb_hits"], errors="coerce").fillna(0)) / games
    pos = pos.where(pos != "OLB", np.where(rush >= 0.9, "EDGE", "LB"))
    return pos


def _derive(s: pd.DataFrame, weekly: pd.DataFrame) -> pd.DataFrame:
    g = lambda c: pd.to_numeric(s[c], errors="coerce") if c in s.columns else pd.Series(np.nan, index=s.index)  # noqa: E731
    reg = weekly[weekly["season_type"] == "REG"]
    sums = reg.groupby("player_id")[["fg_made_50_59", "fg_made_60", "fg_missed_50_59", "fg_missed_60",
                                     "fg_made_distance", "pt_inside_20", "pt_touchback", "pt_return_yards"]].sum(min_count=1)
    ts = reg[reg["targets"].fillna(0) > 0].groupby("player_id")["target_share"].mean()
    s = s.merge(sums, left_on="player_id", right_index=True, how="left")
    s["w_target_share"] = s["player_id"].map(ts)
    d = pd.DataFrame(index=s.index)
    att, sacks = g("passing_attempts"), g("sacks")
    dropbacks = att.fillna(0) + sacks.fillna(0)
    d["epa_per_dropback"] = _div(g("pass_epa"), dropbacks)
    d["adj_yards_per_dropback"] = _div(g("passing_yards") + 20 * g("passing_tds").fillna(0) - 45 * g("interceptions").fillna(0), dropbacks)
    d["pass_success_rate"] = g("adv_pass_success_rate")
    d["completion_pct"] = g("completion_percentage")
    d["td_rate"] = _div(g("passing_tds"), att, 100)
    d["int_rate"] = _div(g("interceptions"), att, 100)
    d["cpoe"] = g("passing_cpoe")
    d["pressure_to_sack"] = _div(sacks, g("adv_times_pressured"), 100)
    d["on_target_pct"] = g("adv_on_target_pct")
    d["bad_throw_pct"] = g("adv_bad_throw_pct")
    d["ngs_aggressiveness"] = g("ngs_aggressiveness")
    d["qb_rush_epa"] = g("rush_epa")
    d["passing_yards"] = g("passing_yards")
    d["passing_tds"] = g("passing_tds")
    d["total_epa"] = g("pass_epa").fillna(0) + g("rush_epa").fillna(0)
    d["rushing_yards"] = g("rushing_yards")
    car = g("rushing_attempts")
    d["rush_epa_per_carry"] = _div(g("rush_epa"), car)
    d["rush_success_rate"] = g("adv_rush_success_rate")
    d["yards_per_carry"] = g("yards_per_carry")
    touches = car.fillna(0) + g("receptions").fillna(0)
    d["fumble_rate"] = _div(g("fumbles_lost").fillna(0), touches, 100)
    d["ngs_rush_yards_over_expected_per_att"] = g("ngs_rush_yards_over_expected_per_att")
    d["rush_explosive_rate"] = g("adv_rush_explosive_rate")
    d["broken_tackle_rate"] = _div(g("adv_broken_tackles_rush").fillna(0) + g("adv_broken_tackles_rec").fillna(0), touches, 100).where(
        g("adv_broken_tackles_rush").notna() | g("adv_broken_tackles_rec").notna())
    d["yac_per_att"] = g("adv_yac_per_att")
    tgt = g("targets")
    d["rec_epa_per_target"] = _div(g("receiving_epa"), tgt)
    d["scrimmage_yards"] = g("rushing_yards").fillna(0) + g("receiving_yards").fillna(0)
    d["total_tds"] = g("rushing_tds").fillna(0) + g("receiving_tds").fillna(0)
    d["receptions"] = g("receptions")
    d["yards_per_target"] = _div(g("receiving_yards"), tgt)
    d["target_success_rate"] = g("adv_target_success_rate")
    d["catch_rate"] = _div(g("receptions"), tgt, 100)
    d["target_share"] = g("w_target_share") * 100
    d["yac_per_rec"] = _div(g("receiving_yac"), g("receptions"))
    d["ngs_avg_separation"] = g("ngs_avg_separation")
    d["ngs_avg_yac_above_expectation"] = g("ngs_avg_yac_above_expectation")
    d["rec_explosive_rate"] = g("adv_rec_explosive_rate")
    d["drop_pct"] = g("adv_drop_pct")
    d["receiving_yards"] = g("receiving_yards")
    d["receiving_tds"] = g("receiving_tds")
    d["targets"] = tgt
    osn = g("offense_snaps")
    d["penalty_rate"] = _div(g("adv_penalties_pbp").fillna(0), osn, 100).where(osn > 0)
    d["team_sack_rate"] = g("ti_team_sack_rate")
    d["team_rush_epa"] = g("ti_team_rush_epa")
    d["team_rush_success"] = g("ti_team_rush_success")
    d["team_pressure_rate"] = g("team_pressure_rate")
    d["offense_snaps"] = osn
    team_max = s.groupby("team_id")["offense_snaps"].transform("max")
    d["snap_share"] = _div(osn, team_max, 100)
    dsn = g("defense_snaps")
    d["pressures"] = g("adv_pressures")
    d["pressure_rate"] = _div(d["pressures"], dsn, 100)
    d["sack_rate"] = _div(g("sacks_defense"), dsn, 100)
    d["stop_rate"] = _div(g("adv_def_stops"), dsn, 100)
    d["tfl_rate"] = _div(g("tackles_for_loss"), dsn, 100)
    d["impact_epa_rate"] = _div(g("adv_def_impact_epa"), dsn, 100)
    d["qb_hit_rate"] = _div(g("qb_hits"), dsn, 100)
    d["hurry_rate"] = _div(g("adv_hurries"), dsn, 100)
    d["missed_tackle_pct"] = g("adv_missed_tackle_pct")
    d["sacks_defense"] = g("sacks_defense")
    d["tackles"] = g("tackles")
    d["tackle_rate"] = _div(g("tackles"), dsn, 100)
    d["tackles_for_loss"] = g("tackles_for_loss")
    d["forced_fumbles"] = g("forced_fumbles")
    d["yds_per_tgt_allowed"] = g("adv_yds_per_tgt_allowed")
    d["cmp_pct_allowed"] = g("adv_cmp_pct_allowed")
    d["passer_rating_allowed"] = g("adv_passer_rating_allowed")
    d["ball_skills_rate"] = _div(g("passes_defended").fillna(0) + g("interceptions_defense").fillna(0), g("adv_targets_allowed"), 100)
    d["passes_defended"] = g("passes_defended")
    d["interceptions_defense"] = g("interceptions_defense")
    d["defense_snaps"] = dsn
    fga = g("fg_att")
    d["fg_pct"] = _div(g("fg_made"), fga, 100)
    m50 = g("fg_made_50_59").fillna(0) + g("fg_made_60").fillna(0)
    a50 = m50 + g("fg_missed_50_59").fillna(0) + g("fg_missed_60").fillna(0)
    d["fg50_pct"] = _div(m50, a50, 100).where(a50 >= 2)
    d["pat_pct"] = _div(g("pat_made"), g("pat_att"), 100)
    d["avg_fg_made_distance"] = _div(g("fg_made_distance"), g("fg_made"))
    d["kickoff_touchback_rate"] = g("adv_kickoff_touchback_rate").where(g("adv_kickoffs") >= 5)
    d["fg_made"] = g("fg_made")
    d["kick_points"] = 3 * g("fg_made").fillna(0) + g("pat_made").fillna(0)
    pts = g("punts")
    d["net_avg"] = _div(g("punt_net_yards"), pts)
    d["gross_avg"] = _div(g("punt_yards"), pts)
    d["inside20_rate"] = _div(g("pt_inside_20"), pts, 100)
    d["punt_touchback_rate"] = _div(g("pt_touchback"), pts, 100)
    d["return_yds_per_punt"] = _div(g("pt_return_yards"), pts)
    d["punts"] = pts
    d["punt_yards"] = g("punt_yards")
    return d


def _eligible(pos: str, s: pd.DataFrame, weeks: int) -> pd.Series:
    w = max(weeks, 1)
    g = lambda c: pd.to_numeric(s[c], errors="coerce").fillna(0)  # noqa: E731
    rules = {
        "QB": g("passing_attempts") >= max(30, 12 * w),
        "RB": g("rushing_attempts") >= max(15, 4 * w),
        "WR": g("targets") >= max(10, 2.5 * w),
        "TE": g("targets") >= max(6, 1.5 * w),
        "OL": g("offense_snaps") >= max(60, 20 * w),
        "K": g("fg_att") >= max(3, 0.8 * w),
        "P": g("punts") >= max(5, 1.5 * w),
    }
    return rules.get(pos, g("defense_snaps") >= max(40, 15 * w))


def _weekly_scores(weekly: pd.DataFrame, posmap: dict[int, str]) -> pd.Series:
    """Per-game GRIDIRON game grade (40-99 scale) normalised within position & season."""
    w = weekly.copy()
    w["rpos"] = w["player_id"].map(posmap)
    f = lambda c: pd.to_numeric(w[c], errors="coerce").fillna(0)  # noqa: E731
    raw = pd.Series(np.nan, index=w.index)
    qual = pd.Series(False, index=w.index)
    dbk = f("passing_attempts") + f("sacks")
    qb = w["rpos"] == "QB"
    raw[qb] = (f("passing_epa") + f("rushing_epa"))[qb] + 8 * _div(f("passing_epa"), dbk).fillna(0)[qb]
    qual |= qb & (dbk >= 12)
    rb = w["rpos"] == "RB"
    touches = f("rushing_attempts") + f("receptions")
    raw[rb] = (f("rushing_epa") + f("receiving_epa") + 0.05 * (f("rushing_yards") + f("receiving_yards")))[rb]
    qual |= rb & (touches >= 6)
    rec = w["rpos"].isin(["WR", "TE"])
    raw[rec] = (f("receiving_epa") + 0.05 * f("receiving_yards"))[rec]
    qual |= rec & (f("targets") >= 2)
    de = w["rpos"].isin(["EDGE", "DL", "LB", "CB", "S"])
    impact = (f("solo_tackles") + 0.5 * f("assisted_tackles") + 2 * f("tackles_for_loss") + 4 * f("sacks_defense")
              + 1.5 * f("qb_hits") + 3 * f("passes_defended") + 5 * f("interceptions_defense") + 4 * f("forced_fumbles")
              + 1.5 * f("pressures"))
    coverage_pen = 0.05 * f("yards_allowed")
    raw[de] = (impact - coverage_pen + 10 * _div(impact, f("defense_snaps")).fillna(0))[de]
    qual |= de & (f("defense_snaps") >= 15)
    k = w["rpos"] == "K"
    raw[k] = (3 * f("fg_made") - 3 * (f("fg_att") - f("fg_made")) + f("pat_made") - 2 * (f("pat_att") - f("pat_made")))[k]
    qual |= k & ((f("fg_att") + f("pat_att")) >= 1)
    p = w["rpos"] == "P"
    raw[p] = _div(f("punt_net_yards"), f("punts"))[p]
    qual |= p & (f("punts") >= 2)
    raw = raw.where(qual)
    pct = raw.groupby(w["rpos"]).rank(pct=True)
    return calibrate(pct.fillna(0)).where(raw.notna())


def calculate_ratings(seasons: list[int] | None = None) -> int:
    from server.ingestion.sync import Log

    log = Log("ratings")
    run_id = db.start_run("ratings")
    total = 0
    try:
        for season in seasons or season_range():
            loaded = _load_season(season)
            if loaded is None:
                log(f"{season}: no season stats; skipped")
                continue
            s, weekly, weeks = loaded
            s["rpos"] = _assign_positions(s)
            s = s[s["rpos"].notna()].reset_index(drop=True)
            # Team pressure rate allowed (PFR): QB pressures / QB pass attempts aggregated by team
            tp = col(s, "adv_times_pressured")
            ta = col(s, "adv_pfr_pass_attempts")
            agg = pd.DataFrame({"team_id": s["team_id"], "tp": tp, "ta": ta}).groupby("team_id").sum(min_count=1)
            s["team_pressure_rate"] = s["team_id"].map(_div(agg["tp"], agg["ta"], 100))
            d = _derive(s, weekly)
            posmap = dict(zip(s["player_id"], s["rpos"]))
            weekly = weekly.copy()
            weekly["game_score"] = _weekly_scores(weekly, posmap)
            # Persist weekly game grades
            gs = weekly[weekly["game_score"].notna()][["player_id", "week", "season_type", "game_score"]].copy()
            gs["season"] = season
            db.upsert("player_weekly_stats", gs.replace({np.nan: None}).to_dict("records"),
                      ["season", "week", "season_type", "player_id"], update=["game_score"])
            reg = weekly[(weekly["season_type"] == "REG") & weekly["game_score"].notna()].sort_values("week")
            gstats = reg.groupby("player_id")["game_score"].agg(
                n="count", std="std", floor=lambda x: x.quantile(0.25), recent=lambda x: x.tail(4).mean())
            last_week = reg.groupby("player_id")["week"].max()
            max_week = int(weekly.loc[weekly["season_type"] == "REG", "week"].max() or 0)

            rating_rows, comp_rows = [], []
            for pos, idx in s.groupby("rpos").groups.items():
                specs = METRICS.get(pos)
                if not specs:
                    continue
                sub = s.loc[idx]
                elig = _eligible(pos, sub, weeks)
                q = sub[elig]
                pct = {}
                for key, _lbl, _cat, _w, hib, _sc in specs:
                    mcol = d.loc[q.index, key] if key in d.columns else pd.Series(np.nan, index=q.index)
                    r = mcol.rank(pct=True, ascending=hib) * 100
                    pct[key] = r.where(mcol.notna())
                pct = pd.DataFrame(pct, index=q.index)
                cat_scores = {}
                for cat in ("efficiency", "advanced", "production"):
                    keys = [(k, w) for k, _l, c, w, _h, _s in specs if c == cat]
                    num_ = sum(pct[k].fillna(0) * w for k, w in keys)
                    den = sum(pct[k].notna() * w for k, w in keys)
                    cat_scores[cat] = (num_ / den.replace(0, np.nan))
                pids = q["player_id"]
                gsq = gstats.reindex(pids.values)
                gsq.index = q.index
                ok = gsq["n"] >= 3
                cons_raw = (gsq["floor"] - 0.5 * gsq["std"].fillna(0)).where(ok)
                cat_scores["consistency"] = cons_raw.rank(pct=True) * 100
                rec_raw = gsq["recent"].where(gsq["n"] >= 1)
                cat_scores["recent_form"] = rec_raw.rank(pct=True) * 100
                cats = pd.DataFrame(cat_scores, index=q.index)
                wsum = sum(cats[c].notna() * w for c, w in CATEGORY_WEIGHTS.items())
                composite = sum(cats[c].fillna(0) * w for c, w in CATEGORY_WEIGHTS.items()) / wsum.replace(0, np.nan)
                comp_pct = composite.rank(pct=True)
                overall = calibrate(comp_pct.fillna(0)).where(composite.notna())
                rank = overall.rank(ascending=False, method="min")
                n_q = int(overall.notna().sum())
                for i in sub.index:
                    pid = int(sub.at[i, "player_id"])
                    base = {"player_id": pid, "season": season, "rating_position": pos,
                            "team_id": sub.at[i, "team_id"], "rating_version": RATING_VERSION,
                            "games_sample": sub.at[i, "games"], "metrics_defined": len(specs),
                            "calculated_at": dt.datetime.now(dt.timezone.utc), "position_count": n_q}
                    if i not in q.index or pd.isna(overall.get(i)):
                        rating_rows.append({**base, "overall_score": None, "tier": "INSUFFICIENT DATA",
                                            "confidence": "LOW", "confidence_score": 0,
                                            "metrics_available": int(sum(pd.notna(d.at[i, k]) for k, *_ in specs if k in d.columns))})
                        continue
                    avail = int(pct.loc[i].notna().sum())
                    adv_avail = int(sum(pct.at[i, k] == pct.at[i, k] for k, _l, c, *_ in specs if c == "advanced"))
                    games = float(sub.at[i, "games"] or 0)
                    pts = (2 if games >= 8 or (weeks and games >= 0.75 * weeks and games >= 3) else 1 if games >= 4 or games >= weeks * 0.5 else 0)
                    pts += 2 if avail / len(specs) >= 0.85 else 1 if avail / len(specs) >= 0.6 else 0
                    pts += 1 if adv_avail >= 2 else 0
                    lw = last_week.get(pid)
                    pts += 1 if lw is not None and lw >= max_week - 2 else 0
                    conf = "HIGH" if pts >= 5 else "MEDIUM" if pts >= 3 else "LOW"
                    if pos == "OL" and conf == "HIGH":
                        conf = "MEDIUM"  # OL inputs are partly team-level; never claim high confidence
                    rating_rows.append({**base,
                        "overall_score": float(overall[i]), "position_score": round(float(comp_pct[i]) * 100, 1),
                        "efficiency_score": _r(cats.at[i, "efficiency"]), "advanced_score": _r(cats.at[i, "advanced"]),
                        "production_score": _r(cats.at[i, "production"]), "consistency_score": _r(cats.at[i, "consistency"]),
                        "recent_form_score": _r(cats.at[i, "recent_form"]), "composite_raw": _r(composite[i], 2),
                        "confidence": conf, "confidence_score": round(pts / 6 * 100, 1), "tier": tier_for(float(overall[i])),
                        "position_rank": int(rank[i]), "metrics_available": avail})
                    cat_den = float(wsum[i])
                    for cat in ("efficiency", "advanced", "production"):
                        keys = [(k, l, w, h, sc) for k, l, c, w, h, sc in specs if c == cat]
                        den = sum(w for k, _l, w, _h, _s in keys if pct.at[i, k] == pct.at[i, k])
                        for k, lbl, w, h, sc in keys:
                            p = pct.at[i, k]
                            raw = d.at[i, k] if k in d.columns else np.nan
                            eff = (CATEGORY_WEIGHTS[cat] / cat_den) * (w / den) if (p == p and den) else 0.0
                            comp_rows.append({"player_id": pid, "season": season, "component": cat, "metric": k,
                                              "label": lbl, "raw_value": _f(raw), "percentile": _r(p),
                                              "weight": round(eff, 4), "weighted_value": round((p if p == p else 0) * eff, 3),
                                              "higher_is_better": h, "scope": sc, "rating_version": RATING_VERSION})
                    for cat, lbl, rawv in (("consistency", "Weekly floor & volatility (game grades)", cons_raw.get(i)),
                                           ("recent_form", "Avg game grade, last 4 games", rec_raw.get(i))):
                        p = cats.at[i, cat]
                        eff = CATEGORY_WEIGHTS[cat] / cat_den if p == p else 0.0
                        comp_rows.append({"player_id": pid, "season": season, "component": cat, "metric": cat,
                                          "label": lbl, "raw_value": _f(rawv), "percentile": _r(p), "weight": round(eff, 4),
                                          "weighted_value": round((p if p == p else 0) * eff, 3), "higher_is_better": True,
                                          "scope": "player", "rating_version": RATING_VERSION})
            with db.tx() as c:
                c.execute("DELETE FROM player_rating_components WHERE season = %s", (season,))
            n = db.upsert("player_ratings", rating_rows, ["player_id", "season"], touch_updated_at=False)
            db.upsert("player_rating_components", comp_rows, ["player_id", "season", "component", "metric"], touch_updated_at=False)
            total += n
            log(f"{season}: {sum(1 for r in rating_rows if r['overall_score'] is not None)} rated, "
                f"{sum(1 for r in rating_rows if r['overall_score'] is None)} insufficient data, {len(comp_rows)} components")
        db.finish_run(run_id, "success", total, f"{total} ratings", log.lines)
    except Exception as exc:  # noqa: BLE001
        db.conn().rollback()
        import traceback

        log(traceback.format_exc())
        db.finish_run(run_id, "error", total, str(exc), log.lines)
        raise
    return total


def _r(v, nd=1):
    try:
        f = float(v)
        return None if np.isnan(f) else round(f, nd)
    except (TypeError, ValueError):
        return None


def _f(v):
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (TypeError, ValueError):
        return None
