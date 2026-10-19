"""Native AAS models schema + durable receipt contract via a loopback HTTP gateway."""
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from native_idempotency import prepare_fixture, verify_prepared
from secure_records import make_handler

ORIGIN = "http://127.0.0.1:5188"
READER = "r" * 40
WRITER = "w" * 40
KEY = "native_p5_mutation_000001"


class NativeAASIdempotencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.tmp.name) / "native_fixture.sqlite")
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("""CREATE TABLE models (
                id INTEGER PRIMARY KEY, experiment_id TEXT, model_name TEXT,
                model_desc TEXT, status TEXT, algorithm TEXT, dataset TEXT,
                table_name TEXT, created_at TEXT, published_at TEXT,
                last_evaluated_at TEXT, evaluation_count INTEGER DEFAULT 0,
                file_path TEXT, metrics_json TEXT, config_json TEXT)""")
            for i in range(1, 4):
                conn.execute("""INSERT INTO models
                    (id,experiment_id,model_name,status,algorithm,evaluation_count)
                    VALUES (?,?,?,?,?,0)""", (i, f"p0_case_{i}", f"Native synthetic {i}",
                                          "draft", "dummy_detector"))
        self.fault = {"commit_then_503_once": False}
        self.start()

    def start(self, *, enabled=True):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0),
            make_handler(self.db, ORIGIN, READER, WRITER, True,
                         enable_native_idempotency=enabled, fault=self.fault))
        self.root = f"http://127.0.0.1:{self.server.server_port}"
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def stop(self):
        if getattr(self, "server", None):
            self.server.shutdown()
            self.server.server_close()
            self.worker.join(timeout=4)
            self.server = None

    def tearDown(self):
        self.stop()
        self.tmp.cleanup()

    def request(self, method, path, body=None, *, key=None, match=None, auth=WRITER, origin=ORIGIN):
        headers = {"Origin": origin}
        if auth is not None:
            headers["Authorization"] = "Bearer " + auth
        if match is not None:
            headers["If-Match"] = match
        if key is not None:
            headers["Idempotency-Key"] = key
        raw = None
        if body is not None:
            raw = json.dumps(body, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
        req = Request(self.root + path, data=raw, method=method, headers=headers)
        try:
            with urlopen(req, timeout=12) as response:
                return response.status, json.load(response), response.headers
        except HTTPError as error:
            return error.code, json.load(error), error.headers

    def etag(self, row=1):
        return self.request("GET", f"/api/records/{row}")[2]["ETag"]

    def patch(self, row=1, *, key=KEY, match=None, state="evaluated"):
        return self.request("PATCH", f"/api/records/{row}", {"status": state},
                            key=key, match=self.etag(row) if match is None else match)

    def native(self, row=1):
        with closing(sqlite3.connect(self.db)) as conn:
            return conn.execute(
                "SELECT status,evaluation_count FROM models WHERE id=?", (row,)).fetchone()

    def receipt_count(self):
        with closing(sqlite3.connect(self.db)) as conn:
            return conn.execute("SELECT COUNT(*) FROM native_mutation_receipts").fetchone()[0]

    def test_01_fixture_prepare_is_explicit_no_automatic_migration(self):
        # A handler with native idempotency refuses an unprepared native DB.
        self.assertEqual(self.receipt_count(), 0)
        with self.assertRaises(ValueError):
            make_handler(self.db, ORIGIN, READER, WRITER, True,
                         enable_native_idempotency=True)
        self.assertEqual(prepare_fixture(self.db), Path(self.db).resolve())
        verify_prepared(self.db)
        self.assertEqual(self.native(1), ("draft", 0))
        self.assertEqual(self.receipt_count(), 0)

    def test_02_refuse_business_models_and_non_native_database(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("INSERT INTO models (id,experiment_id,model_name,status) VALUES (4,'real_case','actual','draft')")
        with self.assertRaises(ValueError):
            prepare_fixture(self.db)
        with closing(sqlite3.connect(self.db)) as conn:
            self.assertIsNone(conn.execute(
                "SELECT 1 FROM sqlite_master WHERE name='native_mutation_receipts'").fetchone())
        empty = Path(self.tmp.name) / "not_native.sqlite"
        with closing(sqlite3.connect(empty)):
            pass
        with self.assertRaises(ValueError):
            prepare_fixture(empty)

    def test_03_fails_closed_on_missing_keys_and_wrong_principal(self):
        old = self.etag()
        self.assertEqual(self.patch(key=None, match=old)[0], 428)
        self.assertEqual(self.patch(key="short", match=old)[0], 428)
        self.assertEqual(self.patch(match='W/"weak"')[0], 428)
        self.assertEqual(self.patch(match='"' + "0" * 64 + '"')[0], 412)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, auth=READER)[0], 403)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, auth=None)[0], 401)
        self.assertEqual(self.request("PATCH", "/api/records/1", {"status": "draft"},
                       key=KEY, match=old, origin="http://attacker.invalid")[0], 403)
        self.assertEqual(self.receipt_count(), 0)

    def test_04_commit_then_503_replay_and_restart_recovery(self):
        prior = self.etag()
        self.fault["commit_then_503_once"] = True
        self.assertEqual(self.patch(match=prior)[0], 503)
        self.assertEqual(self.native(1), ("evaluated", 1))
        self.assertEqual(self.receipt_count(), 1)
        code, receipt, _ = self.request("GET", "/api/mutations/" + KEY)
        self.assertEqual((code, receipt["status"], receipt["response"]["data"]["status"]),
                         (200, "committed", "evaluated"))
        self.stop()
        self.start()
        replay = self.patch(match=prior)
        self.assertEqual(replay[0], 200)
        self.assertEqual(replay[2]["Idempotency-Replayed"], "true")
        self.assertEqual(replay[1], receipt["response"])
        self.assertEqual(self.native(1), ("evaluated", 1))
        self.assertEqual(self.receipt_count(), 1)

    def test_05_same_key_different_intent_rejected(self):
        prior = self.etag()
        self.assertEqual(self.patch(match=prior)[0], 200)
        self.assertEqual(self.patch(match=prior, state="published")[0], 409)
        self.assertEqual(self.patch(match=self.etag())[0], 409)
        self.assertEqual(self.patch(row=2)[0], 409)
        self.assertEqual(self.native(2), ("draft", 0))

    def test_06_parallel_duplicate_key_applies_once(self):
        prior = self.etag()
        with ThreadPoolExecutor(max_workers=8) as pool:
            result = list(pool.map(lambda _: self.patch(match=prior), range(8)))
        self.assertEqual([x[0] for x in result], [200]*8)
        self.assertEqual(sum(x[2].get("Idempotency-Replayed")=="true" for x in result), 7)
        self.assertEqual(self.native(1), ("evaluated", 1))
        self.assertEqual(self.receipt_count(), 1)

    def test_07_parallel_distinct_keys_cas_only_one_wins(self):
        prior = self.etag()
        keys = [f"native_parallel_0000000{i}" for i in range(8)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            result = list(pool.map(lambda key: self.patch(key=key, match=prior), keys))
        self.assertEqual(sorted(x[0] for x in result), [200]+[412]*7)
        self.assertEqual(self.native(1), ("evaluated", 1))
        self.assertEqual(self.receipt_count(), 1)

    def test_08_legacy_mode_never_claims_idempotent_behavior(self):
        self.stop()
        self.start(enabled=False)
        prior = self.etag(1)
        self.assertEqual(self.patch(match=prior)[0], 409)
        self.assertEqual(self.receipt_count(), 0)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY)[0], 404)
        self.assertEqual(self.native(1), ("draft", 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
