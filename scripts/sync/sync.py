#!/usr/bin/env python3
"""GRIDIRON sync CLI.

Usage:
  python scripts/sync/sync.py migrate
  python scripts/sync/sync.py all [--seasons 2016-2026] [--force]
  python scripts/sync/sync.py players|teams|games|rosters|depth-charts|injuries|stats|weekly-stats|season-stats|ngs|ratings|bios
  python scripts/sync/sync.py in-season       # refresh only the current season (scheduled job)

Requires DATABASE_URL in the environment (server-side only).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.ingestion import db, sync  # noqa: E402
from server.ingestion.config import CURRENT_SEASON, START_SEASON  # noqa: E402


def parse_seasons(spec: str | None) -> list[int] | None:
    if not spec:
        return None
    if "-" in spec:
        a, b = spec.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(",")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("job")
    ap.add_argument("--seasons")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    seasons = parse_seasons(a.seasons)
    db.migrate()
    j = a.job.replace("_", "-")
    if j == "migrate":
        print("migrations applied")
        return 0
    if j == "in-season":
        cur = [CURRENT_SEASON]
        sync.syncTeams(); sync.syncPlayers(); sync.syncGames()
        sync.syncRosters(cur); sync.syncDepthCharts(cur); sync.syncInjuries(cur)
        sync.syncWeeklyStats(cur); sync.syncSeasonStats(cur); sync.syncNextGenStats()
        sync.calculateRatings(cur); sync.syncBios()
        return 0
    jobs = {
        "all": lambda: sync.syncAll(seasons, force=a.force),
        "teams": lambda: sync.syncTeams(force=a.force),
        "players": lambda: sync.syncPlayers(force=a.force),
        "games": lambda: sync.syncGames(force=a.force),
        "rosters": lambda: sync.syncRosters(seasons, force=a.force),
        "depth-charts": lambda: sync.syncDepthCharts(seasons, force=a.force),
        "injuries": lambda: sync.syncInjuries(seasons, force=a.force),
        "weekly-stats": lambda: sync.syncWeeklyStats(seasons, force=a.force),
        "season-stats": lambda: sync.syncSeasonStats(seasons, force=a.force),
        "stats": lambda: (sync.syncWeeklyStats(seasons, force=a.force), sync.syncSeasonStats(seasons, force=a.force)),
        "ngs": lambda: sync.syncNextGenStats(force=a.force),
        "ratings": lambda: sync.calculateRatings(seasons),
        "bios": lambda: sync.syncBios(),
    }
    if j not in jobs:
        print(f"unknown job {a.job}; choose from {', '.join(jobs)}", file=sys.stderr)
        return 2
    print(f"GRIDIRON sync '{j}' seasons={seasons or f'{START_SEASON}-{CURRENT_SEASON}'}")
    jobs[j]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
