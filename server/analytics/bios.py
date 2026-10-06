"""Factual player bios assembled ONLY from fields stored in the database (nflverse-sourced).

No narrative is invented: every sentence is a template filled with stored values, and a
sentence is skipped entirely when its inputs are missing.
"""
from __future__ import annotations

import warnings

import pandas as pd

from server.ingestion import db

warnings.filterwarnings("ignore", message="pandas only supports SQLAlchemy")

ORD = {1: "1st", 2: "2nd", 3: "3rd"}


def _ord(n: int) -> str:
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}" + {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _fmt(n) -> str:
    return f"{int(round(float(n))):,}"


def build_bios() -> int:
    from server.ingestion.sync import Log

    log = Log("bios")
    run_id = db.start_run("bios")
    c = db.conn()
    p = pd.read_sql(
        """SELECT p.id, p.display_name, p.position, p.college, p.draft_year, p.draft_round, p.draft_pick,
                  dt.name AS draft_team, lt.name AS latest_team, p.rookie_season, p.experience, p.height, p.weight
           FROM players p LEFT JOIN teams dt ON dt.id = p.draft_team_id LEFT JOIN teams lt ON lt.id = p.latest_team_id
           WHERE EXISTS (SELECT 1 FROM player_season_stats s WHERE s.player_id = p.id)""", c)
    car = pd.read_sql(
        """SELECT player_id, MIN(season) AS first_season, MAX(season) AS last_season, SUM(games) AS games,
                  SUM(passing_yards) AS pass_yds, SUM(passing_tds) AS pass_td, SUM(rushing_yards) AS rush_yds,
                  SUM(rushing_tds) AS rush_td, SUM(receptions) AS rec, SUM(receiving_yards) AS rec_yds,
                  SUM(receiving_tds) AS rec_td, SUM(tackles) AS tkl, SUM(sacks_defense) AS sacks,
                  SUM(interceptions_defense) AS ints, SUM(fg_made) AS fgm, SUM(punts) AS punts
           FROM player_season_stats WHERE season_type='REG' GROUP BY player_id""", c).set_index("player_id")
    best = pd.read_sql(
        """SELECT DISTINCT ON (player_id) player_id, season, overall_score, tier FROM player_ratings
           WHERE overall_score IS NOT NULL ORDER BY player_id, overall_score DESC""", c).set_index("player_id")
    rows = []
    for r in p.itertuples(index=False):
        name, pos = r.display_name, r.position or "player"
        parts = []
        lead = f"{name} is a {pos}"
        if r.latest_team:
            lead += f" most recently listed with the {r.latest_team}"
        parts.append(lead + ".")
        if pd.notna(r.height) and pd.notna(r.weight):
            parts.append(f"Listed at {int(r.height)//12}'{int(r.height)%12}\", {int(r.weight)} lbs.")
        draft = None
        if pd.notna(r.draft_year) and pd.notna(r.draft_round):
            draft = (f"Selected in round {int(r.draft_round)}" + (f" ({_ord(int(r.draft_pick))} overall)" if pd.notna(r.draft_pick) else "")
                     + f" of the {int(r.draft_year)} NFL Draft" + (f" by the {r.draft_team}" if r.draft_team else "") + ".")
        elif pd.notna(r.rookie_season):
            draft = f"Entered the league in {int(r.rookie_season)} without a recorded draft selection."
        college = f"Played college football at {r.college}." if isinstance(r.college, str) and r.college else None
        career = None
        if r.id in car.index:
            c_ = car.loc[r.id]
            bits = []
            for val, label in ((c_.pass_yds, "passing yards"), (c_.pass_td, "passing TD"), (c_.rush_yds, "rushing yards"),
                               (c_.rec, "receptions"), (c_.rec_yds, "receiving yards"), (c_.tkl, "tackles"),
                               (c_.sacks, "sacks"), (c_.ints, "interceptions"), (c_.fgm, "field goals"), (c_.punts, "punts")):
                if pd.notna(val) and float(val) >= (100 if "yards" in label else 5 if label in ("receptions", "tackles", "punts") else 1):
                    bits.append(f"{_fmt(val)} {label}")
            span = f"{int(c_.first_season)}–{int(c_.last_season)}" if c_.first_season != c_.last_season else f"{int(c_.first_season)}"
            career = f"Regular season {span} (GRIDIRON coverage): {_fmt(c_.games or 0)} games" + (", " + ", ".join(bits[:4]) if bits else "") + "."
        if r.id in best.index:
            b = best.loc[r.id]
            parts.append(f"Peak GRIDIRON Analytics Rating in coverage: {round(float(b.overall_score))} ({b.tier.title()}, {int(b.season)}).")
        rows.append({"player_id": int(r.id), "bio": " ".join(x for x in [*parts, draft, college] if x),
                     "career_summary": career, "college_summary": college, "draft_summary": draft})
    n = db.upsert("player_bios", rows, ["player_id"])
    log.rows = n
    log(f"{n} bios generated from stored data")
    db.finish_run(run_id, "success", n, f"{n} bios", log.lines)
    return n
