"""Postgres helpers: migrations, type-safe bulk UPSERT, sync bookkeeping."""
from __future__ import annotations

import datetime as dt
import json
import math
from contextlib import contextmanager
from typing import Any, Iterable, Sequence

import psycopg
from psycopg.types.json import Jsonb

from .config import DATABASE_URL, ROOT

_conn: psycopg.Connection | None = None


def conn() -> psycopg.Connection:
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(DATABASE_URL, autocommit=False)
    return _conn


@contextmanager
def tx():
    c = conn()
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise


def migrate() -> list[str]:
    """Apply database/migrations/*.sql in order, once each."""
    applied: list[str] = []
    with tx() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        done = {r[0] for r in c.execute("SELECT name FROM schema_migrations").fetchall()}
        for path in sorted((ROOT / "database" / "migrations").glob("*.sql")):
            if path.name in done:
                continue
            c.execute(path.read_text())
            c.execute("INSERT INTO schema_migrations(name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied


_coltypes: dict[str, dict[str, str]] = {}


def column_types(table: str) -> dict[str, str]:
    if table not in _coltypes:
        rows = conn().execute(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s AND table_schema = 'public'",
            (table,),
        ).fetchall()
        _coltypes[table] = {r[0]: r[1] for r in rows}
    return _coltypes[table]


def _coerce(value: Any, pgtype: str):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    try:
        import pandas as pd

        if value is pd.NaT or (not isinstance(value, (dict, list, str)) and pd.isna(value)):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item") and not isinstance(value, (dict, list)):
        value = value.item()
    if pgtype in ("integer", "bigint", "smallint"):
        try:
            return int(round(float(value)))
        except (TypeError, ValueError):
            return None
    if pgtype in ("numeric", "double precision", "real"):
        try:
            f = float(value)
            return None if math.isnan(f) or math.isinf(f) else f
        except (TypeError, ValueError):
            return None
    if pgtype == "boolean":
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "t", "yes", "y")
        return bool(value)
    if pgtype == "jsonb":
        return Jsonb(_json_safe(value))
    if pgtype == "date":
        if isinstance(value, (dt.date, dt.datetime)):
            return value if isinstance(value, dt.date) else value.date()
        s = str(value)[:10]
        try:
            return dt.date.fromisoformat(s)
        except ValueError:
            return None
    if pgtype.startswith("timestamp"):
        if isinstance(value, dt.datetime):
            return value
        try:
            return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    s = str(value).strip()
    return s if s != "" else None


def _json_safe(obj):
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items() if _json_safe(v) is not None}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else round(obj, 5)
    if hasattr(obj, "item"):
        try:
            return _json_safe(obj.item())
        except Exception:  # noqa: BLE001
            return None
    try:
        import pandas as pd

        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


def upsert(
    table: str,
    rows: Sequence[dict[str, Any]] | Iterable[dict[str, Any]],
    conflict: Sequence[str],
    update: Sequence[str] | None = None,
    touch_updated_at: bool = True,
) -> int:
    """Bulk UPSERT via COPY into a temp table, then INSERT .. ON CONFLICT DO UPDATE.

    Duplicate keys inside the batch are collapsed (last one wins), making re-runs idempotent.
    """
    rows = list(rows)
    if not rows:
        return 0
    types = column_types(table)
    seen: dict[str, None] = {}
    for r in rows:
        for k in r.keys():
            seen.setdefault(k, None)
    cols = [c for c in seen if c in types]
    update = [c for c in (update if update is not None else cols) if c not in conflict and c in cols]
    tmp = f"_tmp_{table}"
    c = conn()
    with c.cursor() as cur:
        cur.execute(f"DROP TABLE IF EXISTS {tmp}")
        cur.execute(f"CREATE TEMP TABLE {tmp} (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP")
        cur.execute(f"ALTER TABLE {tmp} ADD COLUMN _seq BIGSERIAL")
        collist = ", ".join(cols)
        with cur.copy(f"COPY {tmp} ({collist}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row([_coerce(r.get(col), types[col]) for col in cols])
        keys = ", ".join(conflict)
        sets = [f"{col} = EXCLUDED.{col}" for col in update]
        if touch_updated_at and "updated_at" in types and "updated_at" not in cols:
            sets.append("updated_at = now()")
        action = f"DO UPDATE SET {', '.join(sets)}" if sets else "DO NOTHING"
        cur.execute(
            f"""INSERT INTO {table} ({collist})
                SELECT DISTINCT ON ({keys}) {collist} FROM {tmp}
                WHERE {' AND '.join(f'{k} IS NOT NULL' for k in conflict)}
                ORDER BY {keys}, _seq DESC
                ON CONFLICT ({keys}) {action}"""
        )
        n = cur.rowcount
    c.commit()
    return n


def lookup(sql: str, params: Sequence[Any] = ()) -> dict:
    return {r[0]: r[1] for r in conn().execute(sql, params).fetchall()}


def team_ids() -> dict[str, int]:
    return lookup("SELECT abbreviation, id FROM teams")


def player_ids() -> dict[str, int]:
    return lookup("SELECT gsis_id, id FROM players")


def get_state(dataset: str, part: str) -> dict | None:
    row = conn().execute(
        "SELECT etag, last_modified, content_length, synced_at FROM sync_state WHERE dataset=%s AND part=%s",
        (dataset, part),
    ).fetchone()
    if not row:
        return None
    return {"etag": row[0], "last_modified": row[1], "content_length": row[2], "synced_at": row[3]}


def set_state(dataset: str, part: str, meta, rows: int) -> None:
    with tx() as c:
        c.execute(
            """INSERT INTO sync_state (dataset, part, source_url, etag, last_modified, content_length, rows_upserted, synced_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s, now())
               ON CONFLICT (dataset, part) DO UPDATE SET source_url=EXCLUDED.source_url, etag=EXCLUDED.etag,
                 last_modified=EXCLUDED.last_modified, content_length=EXCLUDED.content_length,
                 rows_upserted=EXCLUDED.rows_upserted, synced_at=now()""",
            (dataset, part, meta.url, meta.etag, meta.last_modified, meta.content_length, rows),
        )


def unchanged(dataset: str, part: str, meta) -> bool:
    st = get_state(dataset, part)
    return bool(st) and st["etag"] == meta.etag and st["last_modified"] == meta.last_modified and st["content_length"] == meta.content_length


def start_run(job: str) -> int:
    with tx() as c:
        return c.execute("INSERT INTO sync_runs (job, status) VALUES (%s, 'running') RETURNING id", (job,)).fetchone()[0]


def finish_run(run_id: int, status: str, rows: int, message: str, log: list[str]) -> None:
    with tx() as c:
        c.execute(
            "UPDATE sync_runs SET status=%s, finished_at=now(), rows_affected=%s, message=%s, log=%s WHERE id=%s",
            (status, rows, message[:2000], "\n".join(log)[-20000:], run_id),
        )


def dumps(obj) -> str:
    return json.dumps(_json_safe(obj))
