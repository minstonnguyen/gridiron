"""GRIDIRON ingestion jobs. Every job is idempotent (UPSERT on natural keys) and incremental.

Public entry points (mirrors the product spec):
    syncTeams, syncPlayers, syncGames, syncRosters, syncDepthCharts, syncInjuries,
    syncWeeklyStats, syncSeasonStats, syncNextGenStats, calculateRatings, syncAll
"""
from __future__ import annotations

import datetime as dt
import traceback
import warnings
from typing import Callable
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from . import db
from .config import CURRENT_SEASON, START_SEASON, season_range
from .sources import load, num, pick

warnings.filterwarnings("ignore", message="pandas only supports SQLAlchemy")
EASTERN = ZoneInfo("America/New_York")
# Franchise continuity: relocated franchises map onto their current abbreviation.
TEAM_ALIASES = {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA", "JAC": "JAX", "WSH": "WAS", "ARZ": "ARI",
                "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SL": "LA"}
CURRENT_TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND",
                 "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF",
                 "TB", "TEN", "WAS"]


class Log:
    def __init__(self, job: str):
        self.job = job
        self.lines: list[str] = []
        self.rows = 0

    def __call__(self, msg: str) -> None:
        stamp = dt.datetime.now().strftime("%H:%M:%S")
        line = f"[{stamp}] {self.job}: {msg}"
        print(line, flush=True)
        self.lines.append(line)


def job(name: str):
    """Decorator: records each job in sync_runs with status + log (shown on /admin/data)."""

    def wrap(fn: Callable):
        def run(*args, **kwargs):
            log = Log(name)
            run_id = db.start_run(name)
            try:
                fn(log, *args, **kwargs)
                db.finish_run(run_id, "success", log.rows, f"{log.rows} rows upserted", log.lines)
                return log.rows
            except Exception as exc:  # noqa: BLE001
                db.conn().rollback()
                log(f"ERROR {exc}")
                log(traceback.format_exc())
                db.finish_run(run_id, "error", log.rows, str(exc), log.lines)
                raise

        run.__name__ = fn.__name__
        return run

    return wrap


def norm_team(abbr) -> str | None:
    if abbr is None or (isinstance(abbr, float) and np.isnan(abbr)):
        return None
    a = str(abbr).strip().upper()
    return TEAM_ALIASES.get(a, a)


def to_int(v):
    try:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def records(df: pd.DataFrame) -> list[dict]:
    return df.replace({np.nan: None}).to_dict("records")


def _should_skip(dataset: str, season: int, meta, force: bool) -> bool:
    """Historical seasons are not re-processed when the upstream file is unchanged."""
    if force:
        return False
    return db.unchanged(dataset, str(season), meta)


def ensure_players(df: pd.DataFrame, id_col: str, name_col: str, pos_col: str | None = None) -> dict[str, int]:
    """Insert minimal player rows for ids that appear in rosters/stats but not in the players file."""
    ids = db.player_ids()
    missing = df[~df[id_col].isin(ids.keys()) & df[id_col].notna()].drop_duplicates(id_col)
    if len(missing):
        rows = [
            {
                "gsis_id": r[id_col],
                "display_name": r.get(name_col) or r[id_col],
                "position": r.get(pos_col) if pos_col else None,
                "search_text": str(r.get(name_col) or "").lower(),
            }
            for r in records(missing)
        ]
        db.upsert("players", rows, ["gsis_id"], update=[])
        ids = db.player_ids()
    return ids


# ---------------------------------------------------------------------------
# Teams / players / games
# ---------------------------------------------------------------------------

@job("teams")
def syncTeams(log: Log, force: bool = False):
    df, meta = load("teams")
    if df is None:
        raise RuntimeError("teams dataset unavailable")
    df = df[df["team_abbr"].isin(CURRENT_TEAMS)]
    sched, _ = load("schedules")
    stadiums: dict[str, str] = {}
    if sched is not None:
        s = sched[(pick(sched, "location") == "Home") & sched["home_score"].notna()].sort_values("gameday")
        for r in s[["home_team", "stadium"]].itertuples(index=False):
            stadiums[norm_team(r.home_team)] = r.stadium
    rows = []
    for r in records(df):
        nick = r.get("team_nick") or ""
        name = r.get("team_name") or r["team_abbr"]
        rows.append({
            "abbreviation": r["team_abbr"],
            "name": name,
            "nickname": nick,
            "city": name[: -len(nick)].strip() if nick and name.endswith(nick) else None,
            "conference": r.get("team_conf"),
            "division": r.get("team_division"),
            "logo_url": r.get("team_logo_espn") or r.get("team_logo_wikipedia"),
            "wordmark_url": r.get("team_wordmark"),
            "primary_color": r.get("team_color"),
            "secondary_color": r.get("team_color2"),
            "tertiary_color": r.get("team_color3"),
            "stadium": stadiums.get(r["team_abbr"]),
        })
    log.rows += db.upsert("teams", rows, ["abbreviation"])
    db.set_state("teams", "all", meta, len(rows))
    log(f"{len(rows)} teams")


@job("players")
def syncPlayers(log: Log, force: bool = False):
    df, meta = load("players")
    if df is None:
        raise RuntimeError("players dataset unavailable")
    if not force and db.unchanged("players", "all", meta):
        log("players file unchanged; skipping")
        return
    teams = db.team_ids()
    df = df[df["gsis_id"].notna()].copy()
    # Only players active in our coverage window (plus anyone without season info).
    last = num(pick(df, "last_season"))
    df = df[(last.isna()) | (last >= START_SEASON - 1)]
    today = dt.date.today()
    rows = []
    for r in records(df):
        bd = r.get("birth_date")
        age = None
        if bd:
            try:
                b = dt.date.fromisoformat(str(bd)[:10])
                age = today.year - b.year - ((today.month, today.day) < (b.month, b.day))
            except ValueError:
                bd = None
        name = r.get("display_name") or f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
        search = " ".join(str(x) for x in [name, r.get("first_name"), r.get("last_name"), r.get("football_name"), r.get("short_name")] if x)
        rows.append({
            "gsis_id": r["gsis_id"],
            "display_name": name,
            "first_name": r.get("first_name"),
            "last_name": r.get("last_name"),
            "position": r.get("position"),
            "position_group": r.get("position_group"),
            "jersey_number": to_int(r.get("jersey_number")),
            "height": to_int(r.get("height")),
            "weight": to_int(r.get("weight")),
            "birth_date": bd,
            "age": age,
            "college": r.get("college_name") or r.get("college"),
            "experience": to_int(r.get("years_of_experience")),
            "status": r.get("status"),
            "rookie_season": to_int(r.get("rookie_season")),
            "last_season": to_int(r.get("last_season")),
            "latest_team_id": teams.get(norm_team(r.get("latest_team"))),
            "draft_year": to_int(r.get("draft_year")),
            "draft_round": to_int(r.get("draft_round")),
            "draft_pick": to_int(r.get("draft_pick")),
            "draft_team_id": teams.get(norm_team(r.get("draft_team"))),
            "headshot_url": r.get("headshot"),
            "pff_id": str(to_int(r["pff_id"])) if to_int(r.get("pff_id")) else None,
            "pfr_id": r.get("pfr_id"),
            "espn_id": str(to_int(r["espn_id"])) if to_int(r.get("espn_id")) else None,
            "search_text": search.lower(),
        })
    log.rows += db.upsert("players", rows, ["gsis_id"])
    db.set_state("players", "all", meta, len(rows))
    log(f"{len(rows)} players upserted")


@job("games")
def syncGames(log: Log, force: bool = False):
    df, meta = load("schedules")
    if df is None:
        raise RuntimeError("schedules dataset unavailable")
    teams = db.team_ids()
    df = df[df["season"] >= START_SEASON].copy()
    now = dt.datetime.now(dt.timezone.utc)
    rows = []
    for r in records(df):
        kickoff = None
        if r.get("gameday"):
            t = r.get("gametime") or "13:00"
            try:
                kickoff = dt.datetime.fromisoformat(f"{r['gameday']}T{t}").replace(tzinfo=EASTERN)
            except ValueError:
                kickoff = None
        has_score = r.get("away_score") is not None and r.get("home_score") is not None
        if has_score:
            status = "final"
        elif kickoff and kickoff < now - dt.timedelta(hours=4):
            status = "awaiting_result"  # kicked off, result not yet published by source
        elif kickoff and kickoff <= now:
            status = "in_progress"      # kickoff passed; source provides no live data
        else:
            status = "scheduled"
        gt = r.get("game_type") or "REG"
        rows.append({
            "external_id": r["game_id"],
            "season": r["season"],
            "week": r["week"],
            "season_type": "REG" if gt == "REG" else "POST",
            "game_type": gt,
            "game_date": r.get("gameday"),
            "kickoff": kickoff,
            "weekday": r.get("weekday"),
            "away_team_id": teams.get(norm_team(r["away_team"])),
            "home_team_id": teams.get(norm_team(r["home_team"])),
            "away_score": r.get("away_score"),
            "home_score": r.get("home_score"),
            "overtime": bool(r.get("overtime")) if r.get("overtime") is not None else None,
            "stadium": r.get("stadium"),
            "roof": r.get("roof"),
            "surface": r.get("surface"),
            "location": r.get("location"),
            "away_coach": r.get("away_coach"),
            "home_coach": r.get("home_coach"),
            "status": status,
            "espn_id": str(to_int(r["espn"])) if to_int(r.get("espn")) else None,
        })
    rows = [r for r in rows if r["away_team_id"] and r["home_team_id"]]
    log.rows += db.upsert("games", rows, ["external_id"])
    db.set_state("schedules", "all", meta, len(rows))
    log(f"{len(rows)} games ({df['season'].min()}–{df['season'].max()})")


# ---------------------------------------------------------------------------
# Rosters / depth charts / injuries
# ---------------------------------------------------------------------------

@job("rosters")
def syncRosters(log: Log, seasons: list[int] | None = None, force: bool = False):
    teams = db.team_ids()
    for season in seasons or season_range():
        df, meta = load("rosters_weekly", season)
        if df is None:
            log(f"{season}: weekly rosters unavailable")
            continue
        if _should_skip("rosters_weekly", season, meta, force):
            log(f"{season}: unchanged, skipped")
            continue
        df = df[df["gsis_id"].notna()].copy()
        df["full_name"] = pick(df, "full_name", "player_name")
        ids = ensure_players(df, "gsis_id", "full_name", "position")
        df["team_id"] = pick(df, "team").map(lambda t: teams.get(norm_team(t)))
        df["player_id"] = df["gsis_id"].map(ids)
        df = df[df["team_id"].notna() & df["player_id"].notna()]
        out = pd.DataFrame({
            "season": df["season"], "week": num(pick(df, "week")).fillna(0), "game_type": pick(df, "game_type"),
            "team_id": df["team_id"], "player_id": df["player_id"], "position": pick(df, "position"),
            "depth_chart_position": pick(df, "depth_chart_position"), "jersey_number": num(pick(df, "jersey_number")),
            "roster_status": pick(df, "status"), "status_description": pick(df, "status_description_abbr"),
        })
        n = db.upsert("rosters", records(out), ["season", "week", "team_id", "player_id"])
        log.rows += n
        db.set_state("rosters_weekly", str(season), meta, n)
        log(f"{season}: {n} roster rows")


def _group_for(label: str, formation: str | None) -> str:
    f = (formation or "").lower()
    if "special" in f:
        return "ST"
    if "defense" in f or f.endswith(" d") or "3-4" in f or "4-3" in f or "nickel" in f:
        return "DEF"
    if "offense" in f or "wr" in f or "te" in f:
        return "OFF"
    return "ST" if label in ("K", "PK", "P", "LS", "H", "KR", "PR", "KO", "KOR") else "OFF"


@job("depth_charts")
def syncDepthCharts(log: Log, seasons: list[int] | None = None, force: bool = False):
    teams = db.team_ids()
    for season in seasons or season_range():
        df, meta = load("depth_charts", season)
        if df is None:
            log(f"{season}: depth charts unavailable")
            continue
        if _should_skip("depth_charts", season, meta, force):
            log(f"{season}: unchanged, skipped")
            continue
        df = df[df["gsis_id"].notna()].copy()
        if "dt" in df.columns:
            out = _depth_daily(df, season, teams, log)
        else:
            out = _depth_weekly(df, season, teams)
        if out is None or out.empty:
            log(f"{season}: no depth rows")
            continue
        ids = ensure_players(out, "gsis_id", "player_name")
        out["player_id"] = out["gsis_id"].map(ids)
        out = out[out["player_id"].notna()]
        out = out.sort_values("depth").drop_duplicates(["season", "week", "team_id", "player_id", "position"])
        n = db.upsert("depth_charts", records(out.drop(columns=["gsis_id", "player_name"])),
                      ["season", "week", "team_id", "player_id", "position"])
        log.rows += n
        db.set_state("depth_charts", str(season), meta, n)
        log(f"{season}: {n} depth rows ({out['source'].iloc[0]})")


def _depth_weekly(df: pd.DataFrame, season: int, teams: dict) -> pd.DataFrame:
    """Legacy weekly format (<=2024): season, club_code, week, depth_team, formation, position, depth_position."""
    label = pick(df, "depth_position").astype("string").str.strip()
    label = label.where(label.notna() & (label != ""), pick(df, "position").astype("string").str.strip())
    team_id = pick(df, "club_code", "team").map(lambda t: teams.get(norm_team(t)))
    depth = num(pick(df, "depth_team")).fillna(9)
    out = pd.DataFrame({
        "season": season, "week": num(pick(df, "week")), "team_id": team_id,
        "gsis_id": df["gsis_id"], "player_name": pick(df, "full_name"),
        "position": label.str.upper(), "formation": pick(df, "formation"),
        "depth": depth, "source": "nflverse_weekly", "snapshot_at": None,
    })
    out = out[out["team_id"].notna() & out["week"].notna() & out["position"].notna() & (out["position"] != "")]
    out["position_group"] = [_group_for(p, f) for p, f in zip(out["position"], out["formation"])]
    out["slot"] = out.groupby(["week", "team_id", "position", "depth"]).cumcount() + 1
    out["starter"] = out["depth"] == 1
    return out


def _depth_daily(df: pd.DataFrame, season: int, teams: dict, log: Log) -> pd.DataFrame:
    """Daily snapshot format (2025+). Each team-week gets the last snapshot published before kickoff;
    the next upcoming game gets the latest snapshot (labelled projected in the UI)."""
    df["ts"] = pd.to_datetime(df["dt"], utc=True, errors="coerce")
    df["team_n"] = df["team"].map(norm_team)
    games = pd.read_sql(
        """SELECT g.week, g.kickoff, t.abbreviation AS team FROM games g
           JOIN teams t ON t.id IN (g.home_team_id, g.away_team_id) WHERE g.season = %(s)s ORDER BY g.kickoff""",
        db.conn(), params={"s": season},
    )
    if games.empty:
        log(f"{season}: no schedule; cannot align daily depth charts")
        return pd.DataFrame()
    games["kickoff"] = pd.to_datetime(games["kickoff"], utc=True)
    now = pd.Timestamp.now(tz="UTC")
    frames = []
    for team, tdf in df.groupby("team_n"):
        snaps = pd.Series(tdf["ts"].dropna().unique()).sort_values().reset_index(drop=True)
        tg = games[games["team"] == team].sort_values("kickoff")
        future_done = False
        for g in tg.itertuples(index=False):
            if g.kickoff > now:
                if future_done:
                    break
                future_done = True
                chosen = snaps.iloc[-1] if len(snaps) else None
            else:
                before = snaps[snaps < g.kickoff] if len(snaps) else snaps
                chosen = before.iloc[-1] if len(before) else None
            if chosen is None:
                continue
            s = tdf[tdf["ts"] == chosen].copy()
            s["week"] = g.week
            frames.append(s)
    if not frames:
        return pd.DataFrame()
    d = pd.concat(frames, ignore_index=True)
    d["pos_rank"] = num(d["pos_rank"])
    d["depth"] = d.groupby(["week", "team_n", "pos_grp", "pos_slot"])["pos_rank"].rank(method="first")
    out = pd.DataFrame({
        "season": season, "week": d["week"], "team_id": d["team_n"].map(teams.get),
        "gsis_id": d["gsis_id"], "player_name": d["player_name"],
        "position": d["pos_abb"].astype("string").str.upper().replace({"PK": "K"}), "formation": d["pos_grp"],
        "slot": num(d["pos_slot"]), "depth": d["depth"], "source": "nflverse_daily", "snapshot_at": d["ts"],
    })
    out["position_group"] = [_group_for(p, f) for p, f in zip(out["position"], out["formation"])]
    out["starter"] = out["depth"] == 1
    return out[out["team_id"].notna()]


@job("injuries")
def syncInjuries(log: Log, seasons: list[int] | None = None, force: bool = False):
    teams = db.team_ids()
    for season in seasons or season_range():
        df, meta = load("injuries", season)
        if df is None:
            log(f"{season}: injury reports unavailable")
            continue
        if _should_skip("injuries", season, meta, force):
            log(f"{season}: unchanged, skipped")
            continue
        df = df[df["gsis_id"].notna()].copy()
        ids = ensure_players(df, "gsis_id", "full_name", "position")
        p1 = pick(df, "report_primary_injury").fillna(pick(df, "practice_primary_injury"))
        p2 = pick(df, "report_secondary_injury").fillna(pick(df, "practice_secondary_injury"))
        desc = [", ".join(str(x) for x in (a, b) if isinstance(x, str) and x) or None for a, b in zip(p1, p2)]
        out = pd.DataFrame({
            "season": season, "week": num(pick(df, "week")), "game_type": pick(df, "game_type"),
            "team_id": pick(df, "team").map(lambda t: teams.get(norm_team(t))),
            "player_id": df["gsis_id"].map(ids), "practice_status": pick(df, "practice_status"),
            "game_status": pick(df, "report_status"), "injury_type": p1, "injury_description": desc,
        })
        out = out[out["team_id"].notna() & out["player_id"].notna() & out["week"].notna()]
        n = db.upsert("injuries", records(out), ["season", "week", "team_id", "player_id"])
        log.rows += n
        db.set_state("injuries", str(season), meta, n)
        log(f"{season}: {n} injury rows")


# ---------------------------------------------------------------------------
# Weekly + season stats
# ---------------------------------------------------------------------------

WEEKLY_MAP = {
    "passing_attempts": ("attempts",), "passing_completions": ("completions",), "passing_yards": ("passing_yards",),
    "passing_tds": ("passing_tds",), "interceptions": ("passing_interceptions", "interceptions"),
    "sacks": ("sacks_suffered", "sacks"), "passing_epa": ("passing_epa",), "passing_cpoe": ("passing_cpoe",),
    "rushing_attempts": ("carries", "rushing_attempts"), "rushing_yards": ("rushing_yards",),
    "rushing_tds": ("rushing_tds",), "rushing_epa": ("rushing_epa",), "targets": ("targets",),
    "receptions": ("receptions",), "receiving_yards": ("receiving_yards",), "receiving_tds": ("receiving_tds",),
    "receiving_epa": ("receiving_epa",), "receiving_yac": ("receiving_yards_after_catch",),
    "solo_tackles": ("def_tackles_solo",), "assisted_tackles": ("def_tackle_assists",),
    "tackles_for_loss": ("def_tackles_for_loss",), "sacks_defense": ("def_sacks",), "qb_hits": ("def_qb_hits",),
    "interceptions_defense": ("def_interceptions",), "passes_defended": ("def_pass_defended",),
    "forced_fumbles": ("def_fumbles_forced",), "fg_made": ("fg_made",), "fg_att": ("fg_att",),
    "pat_made": ("pat_made",), "pat_att": ("pat_att",), "punts": ("pt_att",), "punt_yards": ("pt_yards",),
    "punt_net_yards": ("pt_net_yards",), "penalties": ("penalties",), "fantasy_points_ppr": ("fantasy_points_ppr",),
}


@job("weekly_stats")
def syncWeeklyStats(log: Log, seasons: list[int] | None = None, force: bool = False):
    teams = db.team_ids()
    pfr_to_gsis = db.lookup("SELECT pfr_id, gsis_id FROM players WHERE pfr_id IS NOT NULL")
    for season in seasons or season_range():
        df, meta = load("stats_week", season)
        if df is None:
            log(f"{season}: weekly player stats unavailable")
            continue
        snaps, smeta = load("snap_counts", season)
        pdef, dmeta = load("pfr_def_week", season)
        fp = f"{meta.fingerprint}#{smeta.fingerprint}#{dmeta.fingerprint}"
        class _M:  # composite fingerprint so a change in any input re-processes the season
            url, etag, last_modified, content_length = meta.url, fp[:250], None, None
        if _should_skip("weekly_stats", season, _M, force):
            log(f"{season}: unchanged, skipped")
            continue
        df = df[df["player_id"].notna()].copy()
        df["season_type"] = pick(df, "season_type").fillna("REG")
        base = pd.DataFrame({
            "gsis_id": df["player_id"], "name": pick(df, "player_display_name", "player_name"),
            "position": pick(df, "position"), "week": num(df["week"]), "season_type": df["season_type"],
            "game_external_id": pick(df, "game_id"), "team": pick(df, "team", "recent_team").map(norm_team),
            "opp": pick(df, "opponent_team").map(norm_team),
        })
        for col, cands in WEEKLY_MAP.items():
            base[col] = num(pick(df, *cands))
        raw_cols = [c for c in df.columns if c not in ("player_name", "player_display_name", "headshot_url", "position_group")]
        raw = df[raw_cols]
        base["stats"] = [
            {k: v for k, v in row.items() if v is not None and v == v and v != 0 and k not in ("season",)}
            for row in raw.to_dict("records")
        ]
        # Snap counts (PFR ids) -> gsis; offensive linemen appear only here, so outer-join.
        if snaps is not None and len(snaps):
            s = snaps.copy()
            s["gsis_id"] = pick(s, "pfr_player_id").map(pfr_to_gsis)
            s = s[s["gsis_id"].notna()]
            s = pd.DataFrame({
                "gsis_id": s["gsis_id"], "game_external_id": s["game_id"], "week_s": num(s["week"]),
                "st_type": np.where(pick(s, "game_type").fillna("REG") == "REG", "REG", "POST"),
                "team_s": pick(s, "team").map(norm_team), "opp_s": pick(s, "opponent").map(norm_team),
                "pos_s": pick(s, "position"), "name_s": pick(s, "player"),
                "offense_snaps": num(s["offense_snaps"]), "offense_pct": num(s["offense_pct"]),
                "defense_snaps": num(s["defense_snaps"]), "defense_pct": num(s["defense_pct"]),
                "st_snaps": num(s["st_snaps"]),
            }).drop_duplicates(["gsis_id", "game_external_id"])
            base = base.merge(s, on=["gsis_id", "game_external_id"], how="outer")
            base["week"] = base["week"].fillna(base["week_s"])
            base["season_type"] = base["season_type"].fillna(pd.Series(base["st_type"], index=base.index))
            base["team"] = base["team"].fillna(base["team_s"])
            base["opp"] = base["opp"].fillna(base["opp_s"])
            base["position"] = base["position"].fillna(base["pos_s"])
            base["name"] = base["name"].fillna(base["name_s"])
            base["stats"] = base["stats"].apply(lambda v: v if isinstance(v, dict) else {})
        if pdef is not None and len(pdef):
            d = pdef.copy()
            d["gsis_id"] = pick(d, "pfr_player_id").map(pfr_to_gsis)
            d = pd.DataFrame({
                "gsis_id": d["gsis_id"], "game_external_id": d["game_id"],
                "pressures": num(pick(d, "def_pressures")), "targets_allowed": num(pick(d, "def_targets")),
                "completions_allowed": num(pick(d, "def_completions_allowed")),
                "yards_allowed": num(pick(d, "def_yards_allowed")), "missed_tackles": num(pick(d, "def_missed_tackles")),
            }).dropna(subset=["gsis_id"]).drop_duplicates(["gsis_id", "game_external_id"])
            base = base.merge(d, on=["gsis_id", "game_external_id"], how="left")
        base = base[base["week"].notna()]
        ids = ensure_players(base, "gsis_id", "name", "position")
        games = db.lookup("SELECT external_id, id FROM games WHERE season = %s", (season,))
        base["player_id"] = base["gsis_id"].map(ids)
        base["team_id"] = base["team"].map(teams.get)
        base["opponent_team_id"] = base["opp"].map(teams.get)
        base["game_id"] = base["game_external_id"].map(games)
        base["season"] = season
        keep = ["season", "week", "season_type", "game_id", "game_external_id", "player_id", "team_id",
                "opponent_team_id", "position", *WEEKLY_MAP.keys(), "offense_snaps", "offense_pct", "defense_snaps",
                "defense_pct", "st_snaps", "pressures", "targets_allowed", "completions_allowed", "yards_allowed",
                "missed_tackles", "stats"]
        out = base[[c for c in keep if c in base.columns]]
        out = out[out["player_id"].notna()]
        n = db.upsert("player_weekly_stats", records(out), ["season", "week", "season_type", "player_id"],
                      update=[c for c in out.columns if c != "game_score"])
        log.rows += n
        db.set_state("weekly_stats", str(season), _M, n)
        log(f"{season}: {n} player-week rows (snaps merged: {snaps is not None}, PFR def: {pdef is not None})")


SEASON_AGG_SQL = """
INSERT INTO player_season_stats (
  season, season_type, player_id, team_id, games, snaps, offense_snaps, defense_snaps, st_snaps,
  passing_attempts, passing_completions, passing_yards, passing_tds, interceptions, sacks, completion_percentage,
  pass_epa, pass_epa_per_play, passing_cpoe, rushing_attempts, rushing_yards, rushing_tds, yards_per_carry, rush_epa,
  targets, receptions, receiving_yards, receiving_tds, yards_per_reception, receiving_epa, receiving_yac, touches,
  fumbles_lost, tackles, solo_tackles, assisted_tackles, tackles_for_loss, qb_hits, sacks_defense,
  interceptions_defense, passes_defended, forced_fumbles, fg_made, fg_att, pat_made, pat_att, punts, punt_yards,
  punt_net_yards, penalties, fantasy_points_ppr)
SELECT w.season, w.season_type, w.player_id,
  (ARRAY_AGG(w.team_id ORDER BY w.week DESC))[1],
  COUNT(*) FILTER (WHERE COALESCE(w.offense_snaps,0)+COALESCE(w.defense_snaps,0)+COALESCE(w.st_snaps,0) > 0
                     OR COALESCE(w.passing_attempts,0)+COALESCE(w.rushing_attempts,0)+COALESCE(w.targets,0) > 0
                     OR w.stats <> '{}'::jsonb),
  NULLIF(SUM(COALESCE(w.offense_snaps,0)+COALESCE(w.defense_snaps,0)),0),
  SUM(w.offense_snaps), SUM(w.defense_snaps), SUM(w.st_snaps),
  SUM(w.passing_attempts), SUM(w.passing_completions), SUM(w.passing_yards), SUM(w.passing_tds), SUM(w.interceptions),
  SUM(w.sacks),
  CASE WHEN SUM(w.passing_attempts) > 0 THEN ROUND(100.0*SUM(w.passing_completions)/SUM(w.passing_attempts),2) END,
  SUM(w.passing_epa),
  CASE WHEN SUM(COALESCE(w.passing_attempts,0)+COALESCE(w.sacks,0)) > 0
       THEN SUM(w.passing_epa)/SUM(COALESCE(w.passing_attempts,0)+COALESCE(w.sacks,0)) END,
  CASE WHEN SUM(w.passing_attempts) FILTER (WHERE w.passing_cpoe IS NOT NULL) > 0
       THEN SUM(w.passing_cpoe*w.passing_attempts)/SUM(w.passing_attempts) FILTER (WHERE w.passing_cpoe IS NOT NULL) END,
  SUM(w.rushing_attempts), SUM(w.rushing_yards), SUM(w.rushing_tds),
  CASE WHEN SUM(w.rushing_attempts) > 0 THEN ROUND(SUM(w.rushing_yards)::numeric/SUM(w.rushing_attempts),2) END,
  SUM(w.rushing_epa), SUM(w.targets), SUM(w.receptions), SUM(w.receiving_yards), SUM(w.receiving_tds),
  CASE WHEN SUM(w.receptions) > 0 THEN ROUND(SUM(w.receiving_yards)::numeric/SUM(w.receptions),2) END,
  SUM(w.receiving_epa), SUM(w.receiving_yac),
  NULLIF(SUM(COALESCE(w.rushing_attempts,0)+COALESCE(w.receptions,0)),0),
  SUM(w.fumbles_lost),
  NULLIF(SUM(COALESCE(w.solo_tackles,0)+COALESCE(w.assisted_tackles,0)),0),
  SUM(w.solo_tackles), SUM(w.assisted_tackles), SUM(w.tackles_for_loss), SUM(w.qb_hits), SUM(w.sacks_defense),
  SUM(w.interceptions_defense), SUM(w.passes_defended), SUM(w.forced_fumbles), SUM(w.fg_made), SUM(w.fg_att),
  SUM(w.pat_made), SUM(w.pat_att), SUM(w.punts), SUM(w.punt_yards), SUM(w.punt_net_yards), SUM(w.penalties),
  SUM(w.fantasy_points_ppr)
FROM player_weekly_stats w
WHERE w.season = ANY(%(seasons)s)
GROUP BY w.season, w.season_type, w.player_id
ON CONFLICT (season, season_type, player_id) DO UPDATE SET
  team_id=EXCLUDED.team_id, games=EXCLUDED.games, snaps=EXCLUDED.snaps, offense_snaps=EXCLUDED.offense_snaps,
  defense_snaps=EXCLUDED.defense_snaps, st_snaps=EXCLUDED.st_snaps, passing_attempts=EXCLUDED.passing_attempts,
  passing_completions=EXCLUDED.passing_completions, passing_yards=EXCLUDED.passing_yards,
  passing_tds=EXCLUDED.passing_tds, interceptions=EXCLUDED.interceptions, sacks=EXCLUDED.sacks,
  completion_percentage=EXCLUDED.completion_percentage, pass_epa=EXCLUDED.pass_epa,
  pass_epa_per_play=EXCLUDED.pass_epa_per_play, passing_cpoe=EXCLUDED.passing_cpoe,
  rushing_attempts=EXCLUDED.rushing_attempts, rushing_yards=EXCLUDED.rushing_yards, rushing_tds=EXCLUDED.rushing_tds,
  yards_per_carry=EXCLUDED.yards_per_carry, rush_epa=EXCLUDED.rush_epa, targets=EXCLUDED.targets,
  receptions=EXCLUDED.receptions, receiving_yards=EXCLUDED.receiving_yards, receiving_tds=EXCLUDED.receiving_tds,
  yards_per_reception=EXCLUDED.yards_per_reception, receiving_epa=EXCLUDED.receiving_epa,
  receiving_yac=EXCLUDED.receiving_yac, touches=EXCLUDED.touches, fumbles_lost=EXCLUDED.fumbles_lost,
  tackles=EXCLUDED.tackles, solo_tackles=EXCLUDED.solo_tackles, assisted_tackles=EXCLUDED.assisted_tackles,
  tackles_for_loss=EXCLUDED.tackles_for_loss, qb_hits=EXCLUDED.qb_hits, sacks_defense=EXCLUDED.sacks_defense,
  interceptions_defense=EXCLUDED.interceptions_defense, passes_defended=EXCLUDED.passes_defended,
  forced_fumbles=EXCLUDED.forced_fumbles, fg_made=EXCLUDED.fg_made, fg_att=EXCLUDED.fg_att,
  pat_made=EXCLUDED.pat_made, pat_att=EXCLUDED.pat_att, punts=EXCLUDED.punts, punt_yards=EXCLUDED.punt_yards,
  punt_net_yards=EXCLUDED.punt_net_yards, penalties=EXCLUDED.penalties,
  fantasy_points_ppr=EXCLUDED.fantasy_points_ppr, updated_at=now()
"""

PBP_COLS = [
    "season", "week", "season_type", "game_id", "posteam", "defteam", "play_type", "epa", "success", "cpoe",
    "yards_gained", "qb_dropback", "pass_attempt", "rush_attempt", "sack", "qb_kneel", "qb_spike", "penalty",
    "passer_player_id", "rusher_player_id", "receiver_player_id", "kicker_player_id", "kickoff_attempt", "touchback",
    "penalty_player_id", "sack_player_id", "half_sack_1_player_id", "half_sack_2_player_id",
    "tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id", "interception_player_id",
    "pass_defense_1_player_id", "pass_defense_2_player_id", "forced_fumble_player_1_player_id",
    "forced_fumble_player_2_player_id", "solo_tackle_1_player_id", "solo_tackle_2_player_id",
    "assist_tackle_1_player_id", "assist_tackle_2_player_id", "tackle_with_assist_1_player_id",
    "qb_hit_1_player_id", "qb_hit_2_player_id", "first_down", "air_yards",
]


def _pbp_advanced(season: int) -> tuple[dict[str, dict], dict[str, dict]]:
    """Per-player and per-team advanced metrics from nflverse play-by-play (regular season)."""
    pbp, _ = load("pbp", season, columns=PBP_COLS)
    if pbp is None or pbp.empty:
        return {}, {}
    pbp = pbp[pick(pbp, "season_type") == "REG"]
    adv: dict[str, dict] = {}

    def put(series: pd.Series, key: str):
        for pid, v in series.dropna().items():
            adv.setdefault(pid, {})[key] = float(v)

    succ = num(pick(pbp, "success"))
    epa = num(pick(pbp, "epa"))
    pbp = pbp.assign(_succ=succ, _epa=epa)
    # QB dropbacks
    db_ = pbp[(num(pick(pbp, "qb_dropback")) == 1) & pbp["passer_player_id"].notna()]
    g = db_.groupby("passer_player_id")
    put(g.size(), "dropbacks")
    put(g["_succ"].mean() * 100, "pass_success_rate")
    put(g["_epa"].mean(), "epa_per_dropback")
    # Rushing (excluding kneels)
    ru = pbp[(num(pick(pbp, "rush_attempt")) == 1) & pbp["rusher_player_id"].notna() & (num(pick(pbp, "qb_kneel")) != 1)]
    g = ru.groupby("rusher_player_id")
    put(g["_succ"].mean() * 100, "rush_success_rate")
    put(g["yards_gained"].apply(lambda s: (s >= 10).mean() * 100), "rush_explosive_rate")
    put(g["yards_gained"].apply(lambda s: (s <= 0).mean() * 100), "rush_stuff_rate")
    # Receiving (targets)
    tg = pbp[(num(pick(pbp, "pass_attempt")) == 1) & (num(pick(pbp, "sack")) != 1) & pbp["receiver_player_id"].notna()]
    g = tg.groupby("receiver_player_id")
    put(g["_succ"].mean() * 100, "target_success_rate")
    put(g["yards_gained"].apply(lambda s: (s >= 20).mean() * 100), "rec_explosive_rate")
    put(num(g["air_yards"].mean()), "adot")
    # Defense: stops (tackle on an unsuccessful offensive play) + impact EPA
    tackle_cols = [c for c in ["solo_tackle_1_player_id", "solo_tackle_2_player_id", "assist_tackle_1_player_id",
                               "assist_tackle_2_player_id", "tackle_with_assist_1_player_id"] if c in pbp.columns]
    stops: dict[str, float] = {}
    for c in tackle_cols:
        s = pbp.loc[pbp["_succ"] == 0, c].dropna().value_counts()
        for pid, v in s.items():
            stops[pid] = stops.get(pid, 0) + v
    put(pd.Series(stops), "def_stops")
    impact_cols = [c for c in ["sack_player_id", "half_sack_1_player_id", "half_sack_2_player_id",
                               "tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id", "interception_player_id",
                               "pass_defense_1_player_id", "pass_defense_2_player_id",
                               "forced_fumble_player_1_player_id", "forced_fumble_player_2_player_id"] if c in pbp.columns]
    impact = pbp[impact_cols + ["_epa"]].copy()
    credited = impact[impact_cols].notna().sum(axis=1).replace(0, np.nan)
    impact["_share"] = -impact["_epa"] / credited
    ie: dict[str, float] = {}
    for c in impact_cols:
        s = impact.loc[impact[c].notna()].groupby(c)["_share"].sum()
        for pid, v in s.items():
            ie[pid] = ie.get(pid, 0) + v
    put(pd.Series(ie), "def_impact_epa")
    # Kickoffs
    ko = pbp[(num(pick(pbp, "kickoff_attempt")) == 1) & pbp["kicker_player_id"].notna()]
    if len(ko):
        g = ko.groupby("kicker_player_id")
        put(g.size(), "kickoffs")
        put(num(g["touchback"].mean()) * 100, "kickoff_touchback_rate")
    # Accepted penalties charged to a player
    pen = pbp[(num(pick(pbp, "penalty")) == 1) & pbp["penalty_player_id"].notna()]
    put(pen["penalty_player_id"].value_counts(), "penalties_pbp")
    # Team-level offensive indicators (used, explicitly labelled, for OL ratings)
    team: dict[str, dict] = {}
    dbt = pbp[num(pick(pbp, "qb_dropback")) == 1].groupby("posteam")
    for t, v in (dbt["sack"].mean() * 100).items():
        team.setdefault(norm_team(t), {})["team_sack_rate"] = float(v)
    rt = pbp[(num(pick(pbp, "rush_attempt")) == 1) & (num(pick(pbp, "qb_kneel")) != 1)].groupby("posteam")
    for t, v in rt["_epa"].mean().items():
        team.setdefault(norm_team(t), {})["team_rush_epa"] = float(v)
    for t, v in (rt["_succ"].mean() * 100).items():
        team.setdefault(norm_team(t), {})["team_rush_success"] = float(v)
    return adv, team


def _pfr_season(dataset: str, season: int, fields: dict[str, str]) -> dict[str, dict]:
    df, _ = load(dataset)
    if df is None:
        return {}
    df = df[num(df["season"]) == season].copy()
    if df.empty:
        return {}
    gcol = "g" if "g" in df.columns else None
    if gcol:
        df = df.sort_values(gcol, ascending=False)
    df = df.drop_duplicates("pfr_id")
    out: dict[str, dict] = {}
    for r in records(df):
        vals = {k: (float(r[src]) if r.get(src) is not None else None) for k, src in fields.items() if src in r}
        if "gs" in r and r.get("gs") is not None:
            vals["games_started"] = float(r["gs"])
        out[r["pfr_id"]] = vals
    return out


@job("season_stats")
def syncSeasonStats(log: Log, seasons: list[int] | None = None, force: bool = False):
    seasons = seasons or season_range()
    with db.tx() as c:
        cur = c.execute(SEASON_AGG_SQL, {"seasons": seasons})
        log.rows += cur.rowcount
    log(f"aggregated season totals for {seasons[0]}–{seasons[-1]}")
    gsis_to_pid = db.player_ids()
    pfr_to_pid = db.lookup("SELECT pfr_id, id FROM players WHERE pfr_id IS NOT NULL")
    teams = db.team_ids()
    for season in seasons:
        meta_key = "season_advanced"
        pmeta = None
        try:
            from .sources import head, url_for

            pmeta = head(url_for("pbp", season))
        except Exception:  # noqa: BLE001
            pass
        if pmeta is None or not pmeta.available:
            log(f"{season}: play-by-play unavailable; advanced metrics NULL")
            adv, team = {}, {}
        else:
            if not force and db.unchanged(meta_key, str(season), pmeta) and season < CURRENT_SEASON:
                log(f"{season}: advanced unchanged, skipped")
                continue
            adv, team = _pbp_advanced(season)
        pfr = {}
        for ds, fields in {
            "pfr_def": {"targets_allowed": "tgt", "cmp_pct_allowed": "cmp_percent", "yds_per_tgt_allowed": "yds_tgt",
                        "passer_rating_allowed": "rat", "pressures": "prss", "hurries": "hrry", "qb_knockdowns": "qbkd",
                        "blitzes": "bltz", "missed_tackle_pct": "m_tkl_percent", "missed_tackles": "m_tkl",
                        "tds_allowed": "td", "yds_allowed": "yds"},
            "pfr_pass": {"on_target_pct": "on_tgt_pct", "bad_throw_pct": "bad_throw_pct", "pressure_pct": "pressure_pct",
                         "times_pressured": "times_pressured", "pfr_pass_attempts": "pass_attempts", "drop_pct_qb": "drop_pct",
                         "pocket_time": "pocket_time"},
            "pfr_rush": {"ybc_per_att": "ybc_att", "yac_per_att": "yac_att", "broken_tackles_rush": "brk_tkl",
                         "att_per_broken_tackle": "att_br"},
            "pfr_rec": {"ybc_per_rec": "ybc_r", "yac_per_rec": "yac_r", "pfr_adot": "adot",
                        "broken_tackles_rec": "brk_tkl", "drops": "drop", "drop_pct": "drop_percent",
                        "passer_rating_when_targeted": "rat"},
        }.items():
            for pfr_id, vals in _pfr_season(ds, season, fields).items():
                pid = pfr_to_pid.get(pfr_id)
                if pid:
                    pfr.setdefault(pid, {}).update(vals)
        merged: dict[int, dict] = {}
        for gsis, vals in adv.items():
            pid = gsis_to_pid.get(gsis)
            if pid:
                merged.setdefault(pid, {}).update(vals)
        for pid, vals in pfr.items():
            merged.setdefault(pid, {}).update(vals)
        # QB starts from schedule (starting QB ids are published per game)
        sched, _ = load("schedules")
        if sched is not None and "home_qb_id" in sched.columns:
            s = sched[(sched["season"] == season) & (sched["game_type"] == "REG")]
            starts = pd.concat([s["home_qb_id"], s["away_qb_id"]]).dropna().value_counts()
            for gsis, n in starts.items():
                pid = gsis_to_pid.get(gsis)
                if pid:
                    merged.setdefault(pid, {})["qb_starts"] = float(n)
        rows = []
        for pid, vals in merged.items():
            starts = vals.get("qb_starts", vals.get("games_started"))
            rows.append({"season": season, "season_type": "REG", "player_id": pid,
                         "starts": starts, "advanced": vals})
        # only update players that already have a season row (have played)
        existing = set(r[0] for r in db.conn().execute(
            "SELECT player_id FROM player_season_stats WHERE season=%s AND season_type='REG'", (season,)).fetchall())
        rows = [r for r in rows if r["player_id"] in existing]
        n = db.upsert("player_season_stats", rows, ["season", "season_type", "player_id"], update=["starts", "advanced"])
        # Team-level offensive indicators (explicitly labelled team-scope in OL ratings)
        with db.tx() as c:
            for abbr, vals in team.items():
                tid = teams.get(abbr)
                if tid:
                    c.execute("""INSERT INTO team_season_indicators (season, team_id, indicators) VALUES (%s,%s,%s)
                                 ON CONFLICT (season, team_id) DO UPDATE SET indicators=EXCLUDED.indicators, updated_at=now()""",
                              (season, tid, db.dumps(vals)))
        if pmeta is not None and pmeta.available:
            db.set_state(meta_key, str(season), pmeta, n)
        log.rows += n
        log(f"{season}: advanced metrics for {n} players, {len(team)} team indicator sets")


NGS_ID_COLS = {"season", "season_type", "week", "player_display_name", "player_position", "team_abbr",
               "player_gsis_id", "player_first_name", "player_last_name", "player_jersey_number", "player_short_name"}


@job("next_gen_stats")
def syncNextGenStats(log: Log, force: bool = False):
    ids = db.player_ids()
    for stat_type in ("passing", "rushing", "receiving"):
        ds = f"ngs_{stat_type}"
        df, meta = load(ds)
        if df is None:
            log(f"{stat_type}: unavailable")
            continue
        st = db.get_state(ds, "all")
        if not force and db.unchanged(ds, "all", meta):
            log(f"{stat_type}: unchanged, skipped")
            continue
        df = df[num(df["season"]) >= START_SEASON]
        if st and not force:  # incremental: historical seasons already stored
            df = df[num(df["season"]) >= CURRENT_SEASON]
        df = df[df["player_gsis_id"].isin(ids.keys())]
        metrics = [c for c in df.columns if c not in NGS_ID_COLS and pd.api.types.is_numeric_dtype(df[c])]
        long = df.melt(id_vars=["season", "season_type", "week", "player_gsis_id"], value_vars=metrics,
                       var_name="metric_name", value_name="metric_value")
        long["player_id"] = long["player_gsis_id"].map(ids)
        long["stat_type"] = stat_type
        long = long.drop(columns=["player_gsis_id"])
        n = db.upsert("next_gen_stats", records(long),
                      ["season", "week", "season_type", "player_id", "stat_type", "metric_name"], touch_updated_at=False)
        log.rows += n
        db.set_state(ds, "all", meta, n)
        log(f"{stat_type}: {n} metric rows ({len(metrics)} metrics, seasons {int(df['season'].min()) if len(df) else '-'}+)")


def calculateRatings(seasons: list[int] | None = None, force: bool = False):
    from server.analytics.ratings import calculate_ratings

    return calculate_ratings(seasons)


def syncBios(seasons: list[int] | None = None, force: bool = False):
    from server.analytics.bios import build_bios

    return build_bios()


def syncAll(seasons: list[int] | None = None, force: bool = False):
    db.migrate()
    syncTeams(force=force)
    syncPlayers(force=force)
    syncGames(force=force)
    syncRosters(seasons, force=force)
    syncDepthCharts(seasons, force=force)
    syncInjuries(seasons, force=force)
    syncWeeklyStats(seasons, force=force)
    syncSeasonStats(seasons, force=force)
    syncNextGenStats(force=force)
    calculateRatings(seasons)
    syncBios()
