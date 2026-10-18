"""P5 synthetic SQLite HTTP idempotency/CAS tests; no real AAS data."""
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

from p5_idempotency_reference import initialize_fixture, make_handler

ORIGIN = "http://127.0.0.1:5188"
TOKEN = "p5-only-synthetic-writer-token-not-for-production"
KEY = "p5_write_00000000000001"


class IdempotencyContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "synthetic.db"
        initialize_fixture(self.db)
        self.fault = {"commit_then_503_once": False}
        self.start()

    def start(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0),
            make_handler(self.db, ORIGIN, TOKEN, self.fault))
        self.root = f"http://127.0.0.1:{self.server.server_port}"
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=5)

    def tearDown(self):
        self.stop()
        self.tmp.cleanup()

    def call(self, method, path, *, body=None, key=None, match=None,
             auth=TOKEN, origin=ORIGIN):
        headers = {"Origin": origin}
        if auth is not None:
            headers["Authorization"] = "Bearer " + auth
        if key is not None:
            headers["Idempotency-Key"] = key
        if match is not None:
            headers["If-Match"] = match
        raw = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            raw = json.dumps(body, separators=(",", ":")).encode()
        req = Request(self.root + path, data=raw, method=method, headers=headers)
        try:
            with urlopen(req, timeout=12) as response:
                return response.status, json.load(response), response.headers
        except HTTPError as err:
            return err.code, json.load(err), err.headers

    def get(self, record=1):
        return self.call("GET", f"/api/records/{record}")

    def patch(self, *, key=KEY, etag=None, record=1, state="evaluated"):
        if etag is None:
            etag = self.get(record)[2]["ETag"]
        return self.call("PATCH", f"/api/records/{record}",
            body={"status": state}, key=key, match=etag)

    def test_guard_fixture_auth_scope(self):
        self.assertEqual(self.get()[1]["data"]["version"], 1)
        self.assertEqual(self.call("GET", "/api/records/1", auth=None)[0], 401)
        self.assertEqual(self.call("GET", "/api/records/1", auth="bad")[0], 401)
        self.assertEqual(self.call("GET", "/api/records/1", origin="http://attacker.invalid")[0], 403)
        self.assertEqual(self.call("DELETE", "/api/records/1")[0], 405)
        with self.assertRaises(ValueError):
            initialize_fixture(self.db)
        native = Path(self.tmp.name) / "native.db"
        with closing(sqlite3.connect(native)) as db, db:
            db.execute("CREATE TABLE models(id INTEGER PRIMARY KEY)")
        with self.assertRaises((ValueError, sqlite3.Error)):
            make_handler(native, ORIGIN, TOKEN)

    def test_missing_keys_invalid_version_and_payload_fail_closed(self):
        tag = self.get()[2]["ETag"]
        self.assertEqual(self.patch(key=None, etag=tag)[0], 428)
        self.assertEqual(self.patch(key="short", etag=tag)[0], 428)
        self.assertEqual(self.patch(etag='W/"weak"')[0], 428)
        self.assertEqual(self.patch(etag='"' + '0' * 64 + '"')[0], 412)
        self.assertEqual(self.call("PATCH", "/api/records/1",
            key=KEY, match=tag, body={"other": 123})[0], 422)
        self.assertEqual(self.get()[1]["data"]["version"], 1)

    def test_same_key_replays_exactly_once_and_status_query(self):
        old = self.get()[2]["ETag"]
        first = self.patch(etag=old)
        again = self.patch(etag=old)
        self.assertEqual((first[0], again[0]), (200, 200))
        self.assertEqual(first[1], again[1])
        self.assertEqual(again[2]["Idempotency-Replayed"], "true")
        self.assertEqual(self.get()[1]["data"]["version"], 2)
        status = self.call("GET", "/api/mutations/" + KEY)
        self.assertEqual((status[0], status[1]["status"]), (200, "committed"))

    def test_commit_then_503_durable_replay_after_restart(self):
        old = self.get()[2]["ETag"]
        self.fault["commit_then_503_once"] = True
        self.assertEqual(self.patch(etag=old)[0], 503)
        self.assertEqual(self.get()[1]["data"]["version"], 2)
        self.stop()
        self.start()
        again = self.patch(etag=old)
        self.assertEqual(again[0], 200)
        self.assertEqual(again[2]["Idempotency-Replayed"], "true")
        self.assertEqual(self.get()[1]["data"]["version"], 2)

    def test_same_key_different_intent_returns_409(self):
        old = self.get()[2]["ETag"]
        self.assertEqual(self.patch(etag=old)[0], 200)
        self.assertEqual(self.patch(etag=old, state="published")[0], 409)
        self.assertEqual(self.patch(etag=self.get()[2]["ETag"])[0], 409)
        self.assertEqual(self.patch(record=2)[0], 409)
        self.assertEqual(self.get()[1]["data"]["version"], 2)

    def test_parallel_same_key_exactly_one_write(self):
        old = self.get()[2]["ETag"]
        with ThreadPoolExecutor(max_workers=8) as pool:
            result = list(pool.map(lambda _: self.patch(etag=old), range(8)))
        self.assertEqual([x[0] for x in result], [200] * 8)
        self.assertEqual(sum(x[2].get("Idempotency-Replayed") == "true" for x in result), 7)
        self.assertEqual(self.get()[1]["data"]["version"], 2)

    def test_parallel_unique_keys_one_cas_winner(self):
        old = self.get()[2]["ETag"]
        keys = [f"p5_parallel_0000000000{i:02d}" for i in range(8)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            result = list(pool.map(lambda key: self.patch(key=key, etag=old), keys))
        self.assertEqual(sorted(x[0] for x in result), [200] + [412] * 7)
        self.assertEqual(self.get()[1]["data"]["version"], 2)

    def test_unknown_receipt_not_proof_of_uncommitted_write(self):
        code, body, _ = self.call("GET", "/api/mutations/p5_never_written_00000001")
        self.assertEqual((code, body["status"]), (404, "not_found"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
