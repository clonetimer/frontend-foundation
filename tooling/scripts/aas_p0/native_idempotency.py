#!/usr/bin/env python3
"""Opt-in idempotency ledger for a native AAS SQLite fixture DB.

Never auto-migrate on gateway startup. Preparation refuses databases containing
non-synthetic models. No model rows are changed by preparation.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import re
import sqlite3
from contextlib import closing
from pathlib import Path

SCHEMA = """CREATE TABLE native_mutation_receipts (
    request_key TEXT PRIMARY KEY,
    principal_hash TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    response_etag TEXT NOT NULL,
    created_at TEXT NOT NULL
)"""
KEY = re.compile(r"[A-Za-z0-9_-]{16,128}\Z")
NATIVE_REQUIRED = frozenset({
    "id", "experiment_id", "model_name", "status", "evaluation_count",
    "last_evaluated_at",
})
COLUMNS = (
    "request_key", "principal_hash", "fingerprint", "record_id",
    "response_json", "response_etag", "created_at",
)


def native_path(db_path):
    database = Path(db_path).resolve(strict=True)
    if not database.is_file() or database.suffix.lower() not in (".db", ".sqlite", ".sqlite3"):
        raise ValueError("Existing native SQLite .db/.sqlite/.sqlite3 required")
    return database


def _verify_native_schema(conn):
    columns = {row[1] for row in conn.execute("PRAGMA table_info(models)").fetchall()}
    if not NATIVE_REQUIRED.issubset(columns):
        raise ValueError("Native AAS model schema missing required fields")


def _verify_receipts(conn):
    columns = tuple(row[1] for row in conn.execute(
        "PRAGMA table_info(native_mutation_receipts)").fetchall())
    if columns != COLUMNS:
        raise ValueError("Native idempotency ledger absent or incompatible")
    indexes = conn.execute("PRAGMA index_list(native_mutation_receipts)").fetchall()
    if not any(row[2] for row in indexes):
        raise ValueError("Native idempotency primary key is not unique")


def verify_prepared(db_path):
    db = native_path(db_path)
    with closing(sqlite3.connect(f"file:{db}?mode=ro", uri=True)) as conn:
        _verify_native_schema(conn)
        _verify_receipts(conn)
    return db


def prepare_fixture(db_path):
    """Explicit one-time migration for an isolated synthetic native copy ONLY."""
    database = native_path(db_path)
    with closing(sqlite3.connect(f"file:{database}?mode=rw", uri=True,
                                 isolation_level=None)) as conn:
        conn.execute("PRAGMA busy_timeout=8000")
        conn.execute("BEGIN IMMEDIATE")
        try:
            _verify_native_schema(conn)
            rows = conn.execute("""SELECT COUNT(*) FROM models WHERE experiment_id IS NULL
                OR experiment_id NOT GLOB 'p0_case_[0-9]*'""").fetchone()[0]
            # GLOB is deliberately only a coarse SQL filter. Verify every
            # experiment ID with the exact P0 fixture regex in Python.
            from secure_records import FIXTURE
            if rows or any(not FIXTURE.fullmatch(str(row[0])) for row in
                           conn.execute("SELECT experiment_id FROM models")):
                raise ValueError("Refusing schema migration: real/non-P0 models present")
            existing = conn.execute("""SELECT 1 FROM sqlite_master
                WHERE name='native_mutation_receipts'""").fetchone()
            if existing:
                _verify_receipts(conn)
            else:
                conn.execute(SCHEMA)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
    return database


def principal_hash(writer_token):
    return hashlib.sha256(writer_token.encode("utf-8")).hexdigest()


def fingerprint(method, path, if_match, raw_body):
    return hashlib.sha256(method.encode() + b"\n" + path.encode() +
                          b"\n" + if_match.encode() + b"\n" + raw_body).hexdigest()


def matches_receipt(receipt, writer_token, fp):
    scope = principal_hash(writer_token)
    return (hmac.compare_digest(receipt["principal_hash"], scope) and
            hmac.compare_digest(receipt["fingerprint"], fp))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--prepare-synthetic-copy", action="store_true",
                        help="Explicit opt-in; refuses DBs with any real/non-P0 model")
    opts = parser.parse_args()
    if not opts.prepare_synthetic_copy:
        parser.error("No automatic schema migration. Specify --prepare-synthetic-copy")
    print("Prepared isolated native fixture:", prepare_fixture(opts.db))
