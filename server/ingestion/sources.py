"""nflverse dataset catalog + resilient downloader.

* Uses public nflverse GitHub release assets (no invented APIs, no scraping).
* Detects availability per season with HEAD requests (no GitHub API rate limits).
* Conditional downloads: an asset is re-downloaded only when its ETag / Last-Modified changes.
* Column-tolerant: `pick()` resolves a logical field against several candidate column names
  so upstream renames do not break ingestion; a missing column yields NULLs, never invented values.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

from .config import CACHE_DIR

RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"

CATALOG: dict[str, str] = {
    "players": f"{RELEASES}/players/players.parquet",
    "teams": f"{RELEASES}/teams/teams_colors_logos.csv",
    "schedules": f"{RELEASES}/schedules/games.parquet",
    "rosters_weekly": f"{RELEASES}/weekly_rosters/roster_weekly_{{season}}.csv",
    "depth_charts": f"{RELEASES}/depth_charts/depth_charts_{{season}}.csv",
    "injuries": f"{RELEASES}/injuries/injuries_{{season}}.csv",
    "stats_week": f"{RELEASES}/stats_player/stats_player_week_{{season}}.csv",
    "snap_counts": f"{RELEASES}/snap_counts/snap_counts_{{season}}.csv",
    "pbp": f"{RELEASES}/pbp/play_by_play_{{season}}.parquet",
    "ngs_passing": f"{RELEASES}/nextgen_stats/ngs_passing.csv.gz",
    "ngs_rushing": f"{RELEASES}/nextgen_stats/ngs_rushing.csv.gz",
    "ngs_receiving": f"{RELEASES}/nextgen_stats/ngs_receiving.csv.gz",
    "pfr_def": f"{RELEASES}/pfr_advstats/advstats_season_def.csv",
    "pfr_pass": f"{RELEASES}/pfr_advstats/advstats_season_pass.csv",
    "pfr_rush": f"{RELEASES}/pfr_advstats/advstats_season_rush.csv",
    "pfr_rec": f"{RELEASES}/pfr_advstats/advstats_season_rec.csv",
    "pfr_def_week": f"{RELEASES}/pfr_advstats/advstats_week_def_{{season}}.csv",
}

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "gridiron-ingestion/1.0 (+https://github.com/nflverse)"


@dataclass
class RemoteMeta:
    url: str
    available: bool
    etag: str | None = None
    last_modified: str | None = None
    content_length: int | None = None

    @property
    def fingerprint(self) -> str:
        return f"{self.etag}|{self.last_modified}|{self.content_length}"


def url_for(dataset: str, season: int | None = None) -> str:
    tmpl = CATALOG[dataset]
    return tmpl.format(season=season) if "{season}" in tmpl else tmpl


def head(url: str, retries: int = 3) -> RemoteMeta:
    for attempt in range(retries):
        try:
            r = SESSION.head(url, allow_redirects=True, timeout=30)
            if r.status_code == 404:
                return RemoteMeta(url, False)
            r.raise_for_status()
            cl = r.headers.get("content-length")
            return RemoteMeta(url, True, r.headers.get("etag"), r.headers.get("last-modified"), int(cl) if cl else None)
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return RemoteMeta(url, False)


def _cache_paths(url: str) -> tuple[Path, Path]:
    name = url.split("/releases/download/")[-1].replace("/", "__")
    return CACHE_DIR / name, CACHE_DIR / (name + ".meta.json")


def download(url: str, meta: RemoteMeta | None = None) -> Path | None:
    """Download `url` into the local cache unless the cached copy is still current."""
    meta = meta or head(url)
    if not meta.available:
        return None
    path, meta_path = _cache_paths(url)
    if path.exists() and meta_path.exists():
        cached = json.loads(meta_path.read_text())
        if cached.get("fingerprint") == meta.fingerprint:
            return path
    tmp = path.with_suffix(path.suffix + ".part")
    for attempt in range(3):
        try:
            with SESSION.get(url, stream=True, timeout=180) as r:
                r.raise_for_status()
                with open(tmp, "wb") as fh:
                    for chunk in r.iter_content(1 << 20):
                        fh.write(chunk)
            tmp.replace(path)
            meta_path.write_text(json.dumps({"fingerprint": meta.fingerprint, "url": url}))
            return path
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))
    return None


def read_frame(path: Path, columns: Iterable[str] | None = None) -> pd.DataFrame:
    if path.suffix == ".parquet":
        if columns is not None:
            import pyarrow.parquet as pq

            available = set(pq.ParquetFile(path).schema_arrow.names)
            return pd.read_parquet(path, columns=[c for c in columns if c in available])
        return pd.read_parquet(path)
    return pd.read_csv(path, low_memory=False, compression="infer")


def candidates(url: str) -> list[str]:
    """nflverse occasionally changes an asset's format (e.g. games.csv -> games.csv.gz / games.parquet).
    Try the catalogued URL first, then the same asset in the other published formats."""
    for ext in (".csv.gz", ".csv", ".parquet"):
        if url.endswith(ext):
            stem = url[: -len(ext)]
            return [url] + [stem + e for e in (".parquet", ".csv.gz", ".csv") if e != ext]
    return [url]


def resolve(dataset: str, season: int | None = None) -> tuple[str, RemoteMeta]:
    """Return the first available URL (and its metadata) for a dataset."""
    first: RemoteMeta | None = None
    for url in candidates(url_for(dataset, season)):
        meta = head(url)
        if meta.available:
            return url, meta
        first = first or meta
    return url_for(dataset, season), first or RemoteMeta(url_for(dataset, season), False)


def load(dataset: str, season: int | None = None, columns: Iterable[str] | None = None) -> tuple[pd.DataFrame | None, RemoteMeta]:
    url, meta = resolve(dataset, season)
    if not meta.available:
        return None, meta
    path = download(url, meta)
    if path is None:
        return None, meta
    return read_frame(path, columns), meta


# ---------------------------------------------------------------------------
# Column-tolerant helpers
# ---------------------------------------------------------------------------

def pick(df: pd.DataFrame, *candidates: str, default=None) -> pd.Series:
    """Return the first existing column among candidates, else a NULL series."""
    for c in candidates:
        if c in df.columns:
            return df[c]
    return pd.Series([default] * len(df), index=df.index, dtype="object")


def num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def clean(value):
    """Convert pandas/numpy scalars to plain Python, NaN -> None."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:  # noqa: BLE001
            return value
    return value
