"""Export the GRIDIRON Franchise Mode league seed + calibration tables as static JSON.

Everything in the seed is real public data (nflverse / OverTheCap via nflverse) or is explicitly
flagged as estimated/generated. Nothing here is invented to look like a fact:

* rosters, roster statuses, depth charts, jersey numbers  -> nflverse weekly rosters/depth charts (latest week)
* contracts (per-year base / proration / guarantees / cap) -> nflverse historical_contracts (OverTheCap)
  players without an active contract row get the CBA minimum for their experience, flagged `est`
* head coaches                                           -> nflverse schedules (most recent game)
* 2026 schedule and every completed result               -> nflverse schedules
* ratings, rating components                             -> GRIDIRON ratings (server/analytics/ratings.py)
* combine measurements                                   -> nflverse combine
* calibration tables (score distribution, injuries, aging, draft hit rates, pick value) -> computed below

Usage: python3 scripts/franchise/export_seed.py [out_dir]   (default dist/data/franchise)
"""
from __future__ import annotations

import datetime as dt
import gzip
import json
import math
from decimal import Decimal
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from server.ingestion.config import DATABASE_URL  # noqa: E402
from server.ingestion.sources import RELEASES, download, head  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "data" / "franchise"
OUT.mkdir(parents=True, exist_ok=True)

EXTRA = {
    "contracts": f"{RELEASES}/contracts/historical_contracts.parquet",
    "combine": f"{RELEASES}/combine/combine.parquet",
    "draft_picks": f"{RELEASES}/draft_picks/draft_picks.parquet",
    "players_master": f"{RELEASES}/players/players.parquet",
}


def fetch(name: str) -> pd.DataFrame:
    url = EXTRA[name]
    path = download(url, head(url))
    if path is None:
        raise RuntimeError(f"nflverse asset unavailable: {url}")
    return pd.read_parquet(path)


def q(conn, sql: str, params=None) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        cols = [c.name for c in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def clean(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return round(float(v), 4)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if math.isnan(f) else round(f, 4)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if hasattr(v, "is_integer") and not isinstance(v, bool):
        return round(float(v), 4)
    return v


# ---- position mapping -----------------------------------------------------------------------
POS_GROUP = {
    "QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB", "WR": "WR", "TE": "TE",
    "T": "OT", "OT": "OT", "LT": "OT", "RT": "OT", "G": "IOL", "OG": "IOL", "LG": "IOL", "RG": "IOL", "C": "IOL", "OL": "IOL",
    "DE": "EDGE", "EDGE": "EDGE", "OLB": "EDGE", "DT": "IDL", "NT": "IDL", "DL": "IDL", "IDL": "IDL",
    "LB": "LB", "ILB": "LB", "MLB": "LB", "CB": "CB", "DB": "CB", "S": "S", "SAF": "S", "FS": "S", "SS": "S",
    "K": "K", "P": "P", "LS": "LS",
}


def group_for(pos: str | None, depth_pos: str | None, rating_pos: str | None) -> str:
    for p in (depth_pos, pos):
        if isinstance(p, str) and p.upper() in POS_GROUP:
            g = POS_GROUP[p.upper()]
            # nflverse lists many 3-4 OLBs as LB; trust GRIDIRON's EDGE rating bucket when present
            if g == "LB" and rating_pos == "EDGE":
                return "EDGE"
            if g == "OT" and rating_pos == "OL" and p.upper() in ("G", "C"):
                return "IOL"
            return g
    return {"OL": "IOL", "DL": "IDL"}.get(rating_pos or "", rating_pos or "LS")


ROSTER_STATUS = {  # nflverse status_description codes -> franchise roster lists
    "A01": "active", "I01": "active", "I02": "active",
    "P01": "ps", "P02": "ps", "P03": "ps_intl", "P06": "ps_inj", "P07": "ps",
    "R01": "ir", "R48": "ir_return", "R04": "pup", "R05": "nfi", "R40": "nfi", "R02": "retired",
}


def main() -> None:
    from zoneinfo import ZoneInfo
    today = dt.datetime.now(ZoneInfo("America/New_York")).date()  # league calendar runs on New York time
    with psycopg.connect(DATABASE_URL) as conn:
        season = int(q(conn, "select max(season) s from games where status='final'").s[0])
        teams = q(conn, "select id, abbreviation, name, nickname, city, conference, division, logo_url, primary_color, secondary_color, stadium from teams order by abbreviation")
        teams = teams[teams.conference.notna()]
        tid2abbr = dict(zip(teams.id, teams.abbreviation))

        # ---- latest roster week per team --------------------------------------------------------
        ros = q(conn, """
            with lw as (select team_id, max(week) w from rosters where season=%s group by team_id)
            select r.team_id, r.week, r.position, r.depth_chart_position, r.jersey_number, r.roster_status, r.status_description,
                   p.id pid, p.gsis_id, p.display_name, p.first_name, p.last_name, p.birth_date, p.height, p.weight, p.college,
                   p.experience, p.rookie_season, p.draft_year, p.draft_round, p.draft_pick, p.draft_team_id, p.headshot_url, p.pfr_id
            from rosters r join lw on lw.team_id=r.team_id and lw.w=r.week join players p on p.id=r.player_id
            where r.season=%s and r.roster_status in ('ACT','INA','DEV','RES')""", (season, season))
        ros = ros[ros.team_id.isin(tid2abbr)]
        roster_week = int(ros.week.max())

        # use the season with the bigger sample: current season once >= 6 games, otherwise last season
        both = q(conn, "select player_id, season, rating_position, overall_score, confidence_score, tier, games_sample from player_ratings where season in (%s,%s) and overall_score is not null", (season - 1, season))
        pick_rows = {}
        for pid, g in both.groupby("player_id"):
            cur = g[g.season == season]
            prev = g[g.season == season - 1]
            if len(cur) and (cur.games_sample.iloc[0] >= 6 or not len(prev)):
                pick_rows[pid] = cur.iloc[0]
            elif len(prev) and len(cur):
                # blend: weight current season by its share of a 6-game sample
                w = float(cur.games_sample.iloc[0]) / 6.0
                row = prev.iloc[0].copy()
                row["overall_score"] = float(prev.overall_score.iloc[0]) * (1 - w) + float(cur.overall_score.iloc[0]) * w
                pick_rows[pid] = row
            else:
                pick_rows[pid] = prev.iloc[0]
        comps = q(conn, """select player_id, season, metric, percentile from player_rating_components
                           where season in (%s,%s) and percentile is not null""", (season - 1, season))
        comp_map: dict[int, dict[str, float]] = defaultdict(dict)
        for r in comps.sort_values("season").itertuples():  # current season overwrites previous
            comp_map[r.player_id][r.metric] = round(float(r.percentile), 1)

        depth = q(conn, """with lw as (select team_id, max(week) w from depth_charts where season=%s group by team_id)
                           select d.team_id, d.player_id, d.position, d.formation, d.depth from depth_charts d
                           join lw on lw.team_id=d.team_id and lw.w=d.week where d.season=%s""", (season, season))
        depth_by_player: dict[int, list] = defaultdict(list)
        for r in depth.itertuples():
            depth_by_player[r.player_id].append({"pos": r.position, "depth": int(r.depth) if r.depth is not None else None, "formation": r.formation})

        fa = q(conn, """
            with cur as (select distinct r.player_id from rosters r join (select team_id, max(week) w from rosters where season=%s group by team_id) lw
                         on lw.team_id=r.team_id and lw.w=r.week where r.season=%s and r.roster_status in ('ACT','INA','DEV','RES')),
                 last as (select distinct on (player_id) player_id, season, week, roster_status, position, depth_chart_position, team_id
                          from rosters where season >= %s order by player_id, season desc, week desc)
            select l.roster_status, l.position, l.depth_chart_position, l.season last_roster_season, l.team_id last_team_id,
                   p.id pid, p.gsis_id, p.display_name, p.first_name, p.last_name, p.birth_date, p.height, p.weight, p.college,
                   p.experience, p.rookie_season, p.draft_year, p.draft_round, p.draft_pick, p.draft_team_id, p.headshot_url, p.pfr_id
            from last l join players p on p.id=l.player_id
            where l.player_id not in (select player_id from cur) and l.roster_status not in ('RET')
              and (p.birth_date is null or p.birth_date > (current_date - interval '36 years')) and p.gsis_id is not null""", (season, season, season - 1))
        injtypes = q(conn, """select p.position, i.injury_type, count(*) n from injuries i join players p on p.id=i.player_id
                              where i.game_status in ('Out','Doubtful') and i.injury_type is not null group by 1,2""")
        games = q(conn, """select external_id, season, week, season_type, game_type, game_date, kickoff, weekday, away_team_id, home_team_id,
                                  away_score, home_score, overtime, stadium, roof, location, away_coach, home_coach, status
                           from games where season=%s order by kickoff nulls last, external_id""", (season,))
        hist = q(conn, """select season, week, season_type, away_team_id, home_team_id, away_score, home_score, overtime, location
                          from games where status='final' and season between 2016 and %s""", (season,))
        inj = q(conn, "select season, week, player_id, game_status from injuries where game_type='REG' and season between 2016 and %s", (season - 1,))
        rhist = q(conn, """select r.season, r.week, r.player_id, r.roster_status, r.status_description, p.position, r.depth_chart_position
                           from rosters r join players p on p.id=r.player_id where r.game_type='REG' and r.season between 2016 and %s""", (season - 1,))
        rat_hist = q(conn, """select pr.player_id, pr.season, pr.rating_position, pr.overall_score, pr.games_sample, p.birth_date
                              from player_ratings pr join players p on p.id=pr.player_id where pr.games_sample >= 6""")

    # ---- head coaches: most recent game for each team -------------------------------------------
    coaches = {}
    for r in games[games.status == "final"].sort_values("kickoff").itertuples():
        coaches[tid2abbr.get(r.home_team_id)] = r.home_coach
        coaches[tid2abbr.get(r.away_team_id)] = r.away_coach

    # ---- contracts ------------------------------------------------------------------------------
    con = fetch("contracts")
    con = con[(con.is_active == True) & con.gsis_id.notna()]  # noqa: E712
    con = con.sort_values("year_signed").drop_duplicates("gsis_id", keep="last")
    contract_by_gsis = {}
    for r in con.itertuples():
        years = []
        for y in (r.season_history if r.season_history is not None else []):
            if not str(y.get("year", "")).isdigit():
                continue
            yr = int(y["year"])
            if yr < season:
                continue
            f = lambda k: round(float(y.get(k) or 0.0), 4)  # noqa: E731
            years.append({"year": yr, "base": f("base_salary"), "prorated": f("prorated_bonus"), "roster": f("roster_bonus"),
                          "option": f("option_bonus"), "guaranteed": f("guaranteed_salary"), "cap": f("cap_number"),
                          "other": round(f("workout_bonus") + f("per_game_roster_bonus") + f("other_bonus"), 4)})
        if not years:
            continue
        # a year is a real contract year if it carries more than bonus proration (otherwise it is a void year)
        real = [y for y in years if y["cap"] - y["prorated"] > 0.05]
        for y in years:
            y["void"] = y not in real
        hist_rows = list(r.contract_history) if r.contract_history is not None else []
        ctype = hist_rows[-1].get("contract_type") if hist_rows else None
        contract_by_gsis[r.gsis_id] = {
            "src": "otc", "signed": int(r.year_signed) if r.year_signed == r.year_signed else None,
            "years_total": clean(r.years), "value": clean(r.value), "apy": clean(r.apy), "guaranteed_total": clean(r.guaranteed),
            "apy_cap_pct": clean(r.apy_cap_pct), "type": ctype, "team": r.team,
            "expires": max(y["year"] for y in real) if real else season, "years": years,
        }

    MIN_SAL = [0.885, 1.005, 1.075, 1.145, 1.215, 1.215, 1.215, 1.300]  # 2026 CBA minimums ($M) by credited seasons

    # ---- combine --------------------------------------------------------------------------------
    comb = fetch("combine")
    comb_by_pfr = {}
    for r in comb.itertuples():
        if isinstance(r.pfr_id, str):
            comb_by_pfr[r.pfr_id] = {k: clean(getattr(r, k)) for k in ("forty", "bench", "vertical", "broad_jump", "cone", "shuttle")}

    # ---- players --------------------------------------------------------------------------------
    players = []
    for r in ros.itertuples():
        rt = pick_rows.get(r.pid)
        rating_pos = rt.rating_position if rt is not None else None
        g = group_for(r.position, r.depth_chart_position, rating_pos)
        status = ROSTER_STATUS.get(r.status_description, "active" if r.roster_status == "ACT" else "ps" if r.roster_status == "DEV" else "ir")
        if status == "retired":
            continue
        exp = int(r.experience) if r.experience == r.experience and r.experience is not None else 0
        c = contract_by_gsis.get(r.gsis_id)
        if c is None:
            sal = MIN_SAL[min(max(exp - 1, 0), 7)]
            if status.startswith("ps"):
                sal = round(13750 * 18 / 1e6, 4) if exp <= 2 else round(18350 * 18 / 1e6, 4)
            c = {"src": "est_min", "signed": season, "years_total": 1, "value": sal, "apy": sal, "guaranteed_total": 0, "type": "Minimum (estimated)",
                 "expires": season, "years": [{"year": season, "base": sal, "prorated": 0, "roster": 0, "option": 0, "guaranteed": 0, "cap": sal, "other": 0, "void": False}]}
        players.append({
            "id": r.gsis_id, "name": r.display_name, "first": r.first_name, "last": r.last_name, "team": tid2abbr[r.team_id],
            "pos": r.depth_chart_position or r.position, "listed_pos": r.position, "group": g, "status": status, "status_code": r.status_description,
            "jersey": clean(r.jersey_number), "birth": clean(r.birth_date), "ht": clean(r.height), "wt": clean(r.weight), "college": r.college,
            "exp": exp, "rookie_season": clean(r.rookie_season),
            "draft": {"year": clean(r.draft_year), "round": clean(r.draft_round), "pick": clean(r.draft_pick), "team": tid2abbr.get(r.draft_team_id)} if r.draft_year == r.draft_year and r.draft_year else None,
            "headshot": r.headshot_url,
            "rating": {"season": int(rt.season), "pos": rating_pos, "overall": clean(rt.overall_score), "confidence": clean(rt.confidence_score),
                       "tier": rt.tier, "games": clean(rt.games_sample)} if rt is not None else None,
            "pct": comp_map.get(r.pid) or None,
            "combine": comb_by_pfr.get(r.pfr_id),
            "depth": depth_by_player.get(r.pid) or None,
            "contract": c,
        })

    on_roster = {p["id"] for p in players}
    for r in fa.itertuples():
        if r.gsis_id in on_roster:
            continue
        rt = pick_rows.get(r.pid)
        exp = int(r.experience) if r.experience == r.experience and r.experience is not None else 0
        players.append({
            "id": r.gsis_id, "name": r.display_name, "first": r.first_name, "last": r.last_name, "team": None,
            "pos": r.depth_chart_position or r.position, "listed_pos": r.position,
            "group": group_for(r.position, r.depth_chart_position, rt.rating_position if rt is not None else None),
            "status": "fa", "status_code": r.roster_status, "last_team": tid2abbr.get(r.last_team_id), "last_roster_season": int(r.last_roster_season),
            "jersey": None, "birth": clean(r.birth_date), "ht": clean(r.height), "wt": clean(r.weight), "college": r.college,
            "exp": exp, "rookie_season": clean(r.rookie_season),
            "draft": {"year": clean(r.draft_year), "round": clean(r.draft_round), "pick": clean(r.draft_pick), "team": tid2abbr.get(r.draft_team_id)} if r.draft_year == r.draft_year and r.draft_year else None,
            "headshot": r.headshot_url,
            "rating": {"season": int(rt.season), "pos": rt.rating_position, "overall": clean(rt.overall_score), "confidence": clean(rt.confidence_score),
                       "tier": rt.tier, "games": clean(rt.games_sample)} if rt is not None else None,
            "pct": comp_map.get(r.pid) or None, "combine": comb_by_pfr.get(r.pfr_id), "depth": None, "contract": None,
        })

    # ---- schedule -------------------------------------------------------------------------------
    sched = []
    for r in games.itertuples():
        if r.home_team_id not in tid2abbr or r.away_team_id not in tid2abbr:
            continue
        final = r.status == "final"
        sched.append({"id": r.external_id, "week": int(r.week), "type": r.game_type, "date": clean(r.game_date), "kickoff": clean(r.kickoff),
                      "home": tid2abbr[r.home_team_id], "away": tid2abbr[r.away_team_id], "neutral": r.location == "Neutral",
                      "stadium": r.stadium, "roof": r.roof,
                      "result": {"home": int(r.home_score), "away": int(r.away_score), "ot": bool(r.overtime), "real": True} if final else None})
    last_final = max((s["date"] for s in sched if s["result"]), default=None)

    prev = hist[(hist.season == season - 1) & (hist.season_type == "REG")]
    prior = {}
    for t_id, abbr in tid2abbr.items():
        h = prev[prev.home_team_id == t_id]; a = prev[prev.away_team_id == t_id]
        g = len(h) + len(a)
        pdiff = float((h.home_score - h.away_score).sum() + (a.away_score - a.home_score).sum())
        prior[abbr] = {"season": season - 1, "games": g, "point_diff": pdiff}

    seed = {
        "version": 1, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "season": season, "roster_week": roster_week,
        "start_date": max(today.isoformat(), (dt.date.fromisoformat(last_final) + dt.timedelta(days=1)).isoformat() if last_final else today.isoformat()),
        "last_final_date": last_final,
        "league": {
            "salary_cap": 301.2, "salary_cap_source": "https://www.nfl.com/news/nfl-announces-2026-salary-cap-set-at-301-2-million-per-team",
            "min_salary": MIN_SAL, "min_salary_source": "https://operations.nfl.com/calendar-events/nfl-free-agency/types-of-free-agents",
            "ps_weekly": {"standard": 13750, "vet_min": 18350, "vet_max": 22850},
            "franchise_tag": {"QB": 43.895, "RB": 14.293, "WR": 27.298, "TE": 15.045, "OL": 25.773, "DE": 24.434, "DT": 27.127, "LB": 26.865, "CB": 21.161, "S": 20.149, "KP": 6.649},
            "transition_tag": {"QB": 37.833, "RB": 11.323, "WR": 23.852, "TE": 12.687, "OL": 23.392, "DE": 21.512, "DT": 22.521, "LB": 21.925, "CB": 18.119, "S": 16.012, "KP": 6.005},
            "tag_source": "https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/nfl-announces-franchise-tag-transition-tag-values-for-2026",
            "calendar_source": "https://www.nfl.com/news/2026-27-national-football-league-important-dates",
        },
        "teams": [{"abbr": t.abbreviation, "name": t.name, "nickname": t.nickname, "city": t.city, "conf": t.conference, "div": t.division,
                   "logo": t.logo_url, "color": t.primary_color, "color2": t.secondary_color, "stadium": t.stadium, "head_coach": coaches.get(t.abbreviation),
                   "prev_season": prior.get(t.abbreviation)}
                  for t in teams.itertuples()],
        "players": players,
        "schedule": sched,
    }
    write(OUT / "seed.json", seed)
    print(f"seed: season {season}, roster week {roster_week}, {len(players)} players, {sum(1 for p in players if p['contract'] and p['contract']['src']=='otc')} real contracts, {sum(1 for p in players if p['status']=='fa')} free agents, {len(sched)} games, start {seed['start_date']}")

    # ---- calibration tables ---------------------------------------------------------------------
    cal = {"generated_at": seed["generated_at"]}
    reg = hist[(hist.season_type == "REG") & (hist.season < season)]
    pts = np.concatenate([reg.home_score.values, reg.away_score.values]).astype(int)
    cal["scoring"] = {
        "seasons": f"2016-{season - 1}", "games": int(len(reg)),
        "team_points_hist": {int(k): int(v) for k, v in zip(*np.unique(pts, return_counts=True))},
        "mean_team_points": round(float(pts.mean()), 2), "sd_team_points": round(float(pts.std()), 2),
        "mean_total": round(float((reg.home_score + reg.away_score).mean()), 2),
        "home_win_rate": round(float(((reg.home_score > reg.away_score) & (reg.location != "Neutral")).sum() / max(1, ((reg.home_score != reg.away_score) & (reg.location != "Neutral")).sum())), 4),
        "tie_rate": round(float((reg.home_score == reg.away_score).mean()), 4),
        "ot_rate": round(float(reg.overtime.fillna(False).astype(bool).mean()), 4),
        "one_score_rate": round(float(((reg.home_score - reg.away_score).abs() <= 8).mean()), 4),
        "mean_abs_margin": round(float((reg.home_score - reg.away_score).abs().mean()), 2),
    }
    # empirical joint final scores (winner pts, loser pts, overtime) -> keeps real key-number margins (3, 7, ...)
    pair_counts = {}
    for r in reg.itertuples():
        hi, lo = int(max(r.home_score, r.away_score)), int(min(r.home_score, r.away_score))
        key = f"{hi}-{lo}-{1 if bool(r.overtime) and r.overtime == r.overtime else 0}"
        pair_counts[key] = pair_counts.get(key, 0) + 1
    cal["scoring"]["score_pairs"] = pair_counts
    # team win-total spread (how unequal NFL teams are)
    wins = []
    for (s, t), _ in reg.groupby(["season", "home_team_id"]):
        g = reg[(reg.season == s) & ((reg.home_team_id == t) | (reg.away_team_id == t))]
        w = ((g.home_team_id == t) & (g.home_score > g.away_score)).sum() + ((g.away_team_id == t) & (g.away_score > g.home_score)).sum()
        wins.append(w / len(g))
    cal["scoring"]["sd_team_win_pct"] = round(float(np.std(wins)), 4)

    # injuries: episodes per available player-game and duration in games, by position group
    rh = rhist.copy()
    rh["group"] = [group_for(p, d, None) for p, d in zip(rh.position, rh.depth_chart_position)]
    injset = set(zip(inj.season, inj.week, inj.player_id, inj.game_status))
    out_keys = {(s, w, p) for s, w, p, gs in injset if gs in ("Out", "Doubtful")}
    rh["unavail"] = [(s, w, p) in out_keys or (rs == "RES" and sd in ("R01", "R48")) for s, w, p, rs, sd in zip(rh.season, rh.week, rh.player_id, rh.roster_status, rh.status_description)]
    rh = rh[rh.roster_status.isin(["ACT", "RES"])].sort_values(["player_id", "season", "week"])
    stats = defaultdict(lambda: {"exposures": 0, "episodes": 0, "durations": []})
    for (pid, s), g in rh.groupby(["player_id", "season"], sort=False):
        grp = g.group.iloc[0]
        un = g.unavail.values
        wk = g.week.values
        i = 0
        while i < len(un):
            if not un[i]:
                stats[grp]["exposures"] += 1
                if i + 1 < len(un) and un[i + 1] and wk[i + 1] == wk[i] + 1:
                    j = i + 1
                    while j < len(un) and un[j]:
                        j += 1
                    stats[grp]["episodes"] += 1
                    stats[grp]["durations"].append(int(j - (i + 1)))
                    i = j
                    continue
            i += 1
    inj_out = {}
    for grp, st in stats.items():
        d = np.array(st["durations"]) if st["durations"] else np.array([1])
        inj_out[grp] = {"rate_per_game": round(st["episodes"] / max(1, st["exposures"]), 5), "exposures": st["exposures"], "episodes": st["episodes"],
                        "duration_hist": {int(k): int(v) for k, v in zip(*np.unique(np.clip(d, 1, 18), return_counts=True))},
                        "mean_games_missed": round(float(d.mean()), 2)}
    cal["injuries"] = {"definition": "episode = available (active, not Out/Doubtful) in week w, unavailable in week w+1 (Out/Doubtful or IR); duration = consecutive unavailable weeks (censored at season end)",
                       "seasons": f"2016-{season - 1}", "by_group": inj_out}

    # aging: mean year-over-year change in GRIDIRON overall (position-percentile scale) by position group and age
    rr = rat_hist.dropna(subset=["birth_date"]).copy()
    rr["age"] = [s - b.year - (1 if (b.month, b.day) > (9, 1) else 0) for s, b in zip(rr.season, rr.birth_date)]
    rr["grp"] = [{"OL": "OL", "DL": "DL"}.get(p, p) for p in rr.rating_position]
    rr = rr.sort_values(["player_id", "rating_position", "season"])
    rr["next"] = rr.groupby(["player_id", "rating_position"]).overall_score.shift(-1)
    rr["next_season"] = rr.groupby(["player_id", "rating_position"]).season.shift(-1)
    pairs = rr[(rr.next_season == rr.season + 1)].copy()
    pairs["delta"] = pairs.next.astype(float) - pairs.overall_score.astype(float)
    aging = {}
    for grp, g in pairs.groupby("grp"):
        aging[grp] = {int(a): {"mean_delta": round(float(x.delta.mean()), 2), "n": int(len(x))} for a, x in g.groupby("age") if len(x) >= 15 and 21 <= a <= 38}
    cal["aging"] = {"definition": "mean change in GRIDIRON overall (0-100 position-percentile scale) from age a to a+1; players with >=6 games both seasons", "by_group": aging}

    it = defaultdict(lambda: defaultdict(int))
    for r in injtypes.itertuples():
        g = group_for(r.position, None, None)
        label = str(r.injury_type).split(",")[0].split("/")[0].strip().title()
        if label and label.lower() not in ("not injury related", "rest", "illness", "personal", "nir", "coach's decision"):
            it[g][label] += int(r.n)
    cal["injury_types"] = {g: dict(sorted(v.items(), key=lambda kv: -kv[1])[:14]) for g, v in it.items()}

    research = ROOT / "src" / "franchise" / "calibration"
    for name in ("draftHitRates.json", "pickValue.json", "combineDist.json"):
        p = research / name
        if p.exists():
            cal[name.replace(".json", "")] = json.loads(p.read_text())
    write(OUT / "calibration.json", cal)
    print("calibration:", json.dumps(cal["scoring"])[:400])


def sanitize(o):
    if isinstance(o, dict):
        return {str(k): sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [sanitize(v) for v in o]
    if isinstance(o, (str, bool)) or o is None:
        return o
    if isinstance(o, int) and not isinstance(o, bool):
        return o
    try:
        if pd.isna(o):
            return None
    except (TypeError, ValueError):
        pass
    return clean(o)


def write(path: Path, obj) -> None:
    obj = sanitize(obj)
    raw = json.dumps(obj, separators=(",", ":"), default=clean, allow_nan=False)
    path.write_text(raw)
    print(f"wrote {path} ({len(raw) / 1e6:.2f} MB, {len(gzip.compress(raw.encode())) / 1e6:.2f} MB gz)")


if __name__ == "__main__":
    main()
