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
    "shinhan_isa_history",
    "shinhan_isa_holdings",
    "crypto_holdings",
    "crypto_history",
    "real_estate",
    "yearly_records",
    "monthly_records",
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


def ensure_sqlite_schema(sqlite: sqlite3.Connection):
    if not SUPABASE_SCHEMA_PATH.exists():
        return

    statements = []
    for chunk in SUPABASE_SCHEMA_PATH.read_text(encoding="utf-8").split(";"):
        stmt = chunk.strip()
        if not stmt:
            continue
        lowered = stmt.lower()
        if "enable row level security" in lowered:
            continue
        if lowered.startswith("drop policy ") or lowered.startswith("create policy "):
            continue
        if lowered.startswith("alter table ") and " add column if not exists " in lowered:
            stmt = stmt.replace(" IF NOT EXISTS ", " ", 1).replace(" if not exists ", " ", 1)
        statements.append(stmt)

    for stmt in statements:
        try:
            sqlite.execute(f"{stmt};")
        except sqlite3.OperationalError:
            pass
    sqlite.commit()


def main():
    load_backend_env()
    database_url = (
        os.environ.get("SUPABASE_DATABASE_URL", "").strip()
        or os.environ.get("DATABASE_URL", "").strip()
    )
    if not database_url:
        raise SystemExit("SUPABASE_DATABASE_URL is required")

    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    sqlite = sqlite3.connect(SQLITE_PATH)
    sqlite.row_factory = sqlite3.Row
    ensure_sqlite_schema(sqlite)
    pg = create_engine(normalize_url(database_url), pool_pre_ping=True)

    with pg.begin() as conn:
        for table in TABLES:
            remote_columns = [
                row[0]
                for row in conn.execute(
                    text(
                        "select column_name from information_schema.columns "
                        "where table_schema='public' and table_name=:table "
                        "order by ordinal_position"
                    ),
                    {"table": table},
                )
            ]
            if not remote_columns:
                continue

            local_exists = sqlite.execute(
                "select name from sqlite_master where type='table' and name=?",
                (table,),
            ).fetchone()
            if not local_exists:
                continue

            local_columns = [
                row["name"]
                for row in sqlite.execute(f"pragma table_info({table})").fetchall()
            ]
            columns = [col for col in remote_columns if col in local_columns]
            if not columns:
                continue

            rows = [
                dict(zip(columns, row))
                for row in conn.execute(text(f"select {', '.join(columns)} from {table}")).fetchall()
            ]

            sqlite.execute(f"delete from {table}")
            if rows:
                placeholders = ", ".join("?" for _ in columns)
                sqlite.executemany(
                    f"insert into {table} ({', '.join(columns)}) values ({placeholders})",
                    [tuple(row[col] for col in columns) for row in rows],
                )
            sqlite.commit()
            print(f"{table}: {len(rows)} rows synced")


if __name__ == "__main__":
    main()
