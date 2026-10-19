#!/usr/bin/env python3
"""Disposable native AAS SQLite+HTTP fixture for Chromium P5-R2b2 acceptance only.

Creates an isolated native-schema synthetic test database under TemporaryDirectory.
This file is NOT a production server and never opens an existing user database.
"""
from __future__ import annotations
import argparse
import sqlite3
import tempfile
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path

from native_idempotency import prepare_fixture
from secure_records import make_handler

WRITER = "p5-browser-fixture-" + "x" * 40
READER = "p5-browser-reader-" + "y" * 40


def run(port: int, origin: str) -> None:
    with tempfile.TemporaryDirectory(prefix="p5_browser_synthetic_") as workspace:
        path = str(Path(workspace) / "p5_native_browser.sqlite")
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("""CREATE TABLE models (
                id INTEGER PRIMARY KEY, experiment_id TEXT, model_name TEXT,
                model_desc TEXT, status TEXT, algorithm TEXT, dataset TEXT,
                table_name TEXT, created_at TEXT, published_at TEXT,
                last_evaluated_at TEXT, evaluation_count INTEGER DEFAULT 0,
                file_path TEXT, metrics_json TEXT, config_json TEXT)""")
            db.execute("""INSERT INTO models
                (id,experiment_id,model_name,status,algorithm,evaluation_count)
                VALUES (1,'p0_case_1','P5-CI-Synthetic','draft','dummy_detector',0)""")
        prepare_fixture(path)
        fault = {"commit_then_503_once": True}
        Parent = make_handler(path, origin, READER, WRITER, True,
                              enable_native_idempotency=True, fault=fault)

        class Fixture(Parent):
            def do_GET(self):
                if self.path == "/__p5_test_counts":
                    with closing(sqlite3.connect(path)) as db:
                        count = db.execute(
                            "SELECT evaluation_count FROM models WHERE id=1").fetchone()[0]
                        receipts = db.execute(
                            "SELECT COUNT(*) FROM native_mutation_receipts").fetchone()[0]
                    return self.reply(200, {
                        "evaluationCount": count, "receiptCount": receipts,
                        "faultConsumed": not fault["commit_then_503_once"]
                    })
                return super().do_GET()

        server = ThreadingHTTPServer(("127.0.0.1", port), Fixture)
        try:
            server.serve_forever()
        finally:
            server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5499)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be 1024..65535")
    run(args.port, args.origin)
