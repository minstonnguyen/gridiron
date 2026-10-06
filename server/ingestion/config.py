"""Runtime configuration for the GRIDIRON ingestion layer.

Secrets (DATABASE_URL) are read from the environment only and never shipped to the browser.
"""
from __future__ import annotations

import datetime as dt
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = Path(os.environ.get("GRIDIRON_CACHE_DIR", ROOT / ".cache" / "nflverse"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://gridiron:gridiron@localhost:5432/gridiron")

# Earliest season we try to backfill. Each dataset's real availability is detected at runtime.
START_SEASON = int(os.environ.get("GRIDIRON_START_SEASON", "2016"))

RATING_VERSION = "gar-1.0"


def current_season(today: dt.date | None = None) -> int:
    """NFL season containing `today`.

    The league year flips in March, but games for a season are played Sep→Feb. A date in
    Jan/Feb belongs to the previous calendar year's season. From March onward we consider the
    upcoming season "current" (its schedule is published in May; data availability is still
    verified against the database before the UI defaults to it).
    """
    today = today or dt.date.today()
    return today.year if today.month >= 3 else today.year - 1


CURRENT_SEASON = int(os.environ.get("GRIDIRON_CURRENT_SEASON", current_season()))


def season_range(first: int | None = None, last: int | None = None) -> list[int]:
    return list(range(first or START_SEASON, (last or CURRENT_SEASON) + 1))
