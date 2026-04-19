import os
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
SQLITE_PATH = ROOT / "backend" / "assets.db"
BACKEND_ENV_PATH = ROOT / "backend" / ".env"
SUPABASE_SCHEMA_PATH = ROOT / "supabase" / "schema.sql"

TABLES = [
    "settings",
    "savings",
    "overseas_holdings",
    "rebal_history",
    "isa_history",
    "isa_holdings",
    "crypto_holdings",
    "crypto_history",
    "real_estate",
    "yearly_records",
]


def load_backend_env():
    if not BACKEND_ENV_PATH.exists():
        return
    for raw_line in BACKEND_ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def main():
    load_backend_env()
    database_url = (
        os.environ.get("SUPABASE_DATABASE_URL", "").strip()
        or os.environ.get("DATABASE_URL", "").strip()
    )
    if not database_url:
        raise SystemExit("SUPABASE_DATABASE_URL is required")
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite file not found: {SQLITE_PATH}")

    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = sqlite3.Row
    pg = create_engine(normalize_url(database_url), pool_pre_ping=True)

    with pg.begin() as conn:
        if SUPABASE_SCHEMA_PATH.exists():
            conn.execute(text(SUPABASE_SCHEMA_PATH.read_text(encoding="utf-8")))

        for table in TABLES:
            exists = sqlite.execute(
                "select name from sqlite_master where type='table' and name=?",
                (table,),
            ).fetchone()
            if not exists:
                continue

            rows = [dict(row) for row in sqlite.execute(f"select * from {table}").fetchall()]
            if not rows:
                continue

            columns = rows[0].keys()
            col_sql = ", ".join(columns)
            val_sql = ", ".join(f":{col}" for col in columns)
            update_sql = ", ".join(f"{col}=excluded.{col}" for col in columns if col != "id")
            pk = "key" if table == "settings" else "id"
            stmt = text(
                f"insert into {table} ({col_sql}) values ({val_sql}) "
                f"on conflict ({pk}) do update set {update_sql}"
            )
            conn.execute(stmt, rows)
            print(f"{table}: {len(rows)} rows copied")


if __name__ == "__main__":
    main()
