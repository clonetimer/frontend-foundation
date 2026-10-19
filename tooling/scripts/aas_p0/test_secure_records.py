"""P0 gateway contract: stdlib HTTP against synthetic AAS models SQLite schema."""
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
from secure_records import make_handler, loopback_origin

ORIGIN = "http://127.0.0.1:5188"
READER = "r" * 40
WRITER = "w" * 40


class NativeSQLiteAuthCASTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = str(Path(cls.tmp.name) / "synthetic_model.db")
        with closing(sqlite3.connect(cls.db)) as conn, conn:
            conn.execute("""CREATE TABLE models (
                id INTEGER PRIMARY KEY, experiment_id TEXT, model_name TEXT,
                model_desc TEXT, status TEXT, algorithm TEXT, dataset TEXT,
                table_name TEXT, created_at TEXT, published_at TEXT,
                last_evaluated_at TEXT, evaluation_count INTEGER DEFAULT 0,
                file_path TEXT, metrics_json TEXT, config_json TEXT)""")
            for index in range(1, 806):
                conn.execute("""INSERT INTO models
                    (id,experiment_id,model_name,status,algorithm,created_at,evaluation_count)
                    VALUES (?,?,?,?,?,?,0)""",
                    (index, f"p0_case_{index}" if index < 805 else "business_model",
                     f"Object {index:04d}", "draft" if index % 2 else "published",
                     "dummy_detector", "2026-10-15"))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0),
                                         make_handler(cls.db, ORIGIN, READER, WRITER, True))
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.tmp.cleanup()

    def api(self, method, path, role="reader", payload=None, headers=None):
        h = {"Origin": ORIGIN}
        if role != "none":
            h["Authorization"] = "Bearer " + (WRITER if role == "writer" else READER if role == "reader" else "invalid")
        if payload is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        req = Request(self.url + path, method=method,
                      data=json.dumps(payload).encode() if payload is not None else None,
                      headers=h)
        try:
            with urlopen(req, timeout=10) as response:
                return response.status, json.load(response) if response.status != 204 else {}, response.headers
        except HTTPError as error:
            return error.code, json.load(error), error.headers

    def test_01_tokens_origin_and_permissions(self):
        self.assertEqual(self.api("GET", "/api/records", role="none")[0], 401)
        self.assertEqual(self.api("GET", "/api/records", role="wrong")[0], 401)
        self.assertEqual(self.api("PATCH", "/api/records/1", payload={"status": "draft"})[0], 403)
        self.assertEqual(self.api("GET", "/api/records", headers={"Origin": "http://attacker.example"})[0], 403)
        self.assertEqual(self.api("OPTIONS", "/api/records", headers={"Origin": "http://attacker.example"})[0], 403)
        self.assertEqual(self.api("OPTIONS", "/api/records")[0], 204)
        for origin in ("http://0.0.0.0:9999", "https://127.0.0.1:9999", "http://u:p@127.0.0.1:9999"):
            with self.assertRaises(ValueError):
                loopback_origin(origin)
        with self.assertRaises(ValueError):
            make_handler(self.db, ORIGIN, "weak", WRITER)

    def test_02_real_offset_count_not_capped_at_500(self):
        status, response, _ = self.api("GET", "/api/records?page=1&pageSize=20")
        self.assertEqual((status, response["data"]["total"], len(response["data"]["items"])), (200, 805, 20))
        status, response, _ = self.api("GET", "/api/records?page=41&pageSize=20&sort=id&order=desc")
        self.assertEqual((status, response["data"]["total"], len(response["data"]["items"])), (200, 805, 5))
        self.assertEqual(self.api("GET", "/api/records?filterField=status&filter=published")[1]["data"]["total"], 402)
        self.assertEqual(self.api("GET", "/api/records?search=Object%200010")[1]["data"]["total"], 1)
        self.assertEqual(self.api("GET", "/api/records?search=%25")[1]["data"]["total"], 0)
        for query in ("page=0", "pageSize=21", "sort=bad", "order=bad", "unknown=x", "page=1&page=2", "filter=draft"):
            self.assertEqual(self.api("GET", "/api/records?" + query)[0], 400, query)

    def test_03_strong_etag_and_legacy_writer_conflict(self):
        status, doc, headers = self.api("GET", "/api/records/3")
        original = headers["ETag"]
        self.assertEqual(status, 200)
        self.assertEqual(doc["data"]["_etag"], original)
        self.assertEqual(self.api("PATCH", "/api/records/3", "writer", {"status": "draft"})[0], 428)
        self.assertEqual(self.api("PATCH", "/api/records/3", "writer", {"name": "no"}, {"If-Match": original})[0], 422)
        status, doc, headers = self.api("PATCH", "/api/records/3", "writer",
                                        {"status": "evaluated"}, {"If-Match": original})
        self.assertEqual(status, 200)
        self.assertNotEqual(headers["ETag"], original)
        self.assertEqual(self.api("PATCH", "/api/records/3", "writer", {"status": "draft"},
                                  {"If-Match": original})[0], 412)
        with closing(sqlite3.connect(self.db)) as conn, conn:
            self.assertEqual(conn.execute("SELECT evaluation_count FROM models WHERE id=3").fetchone()[0], 1)
            conn.execute("UPDATE models SET status='draft' WHERE id=3")
        self.assertEqual(self.api("PATCH", "/api/records/3", "writer", {"status": "published"},
                                  {"If-Match": headers["ETag"]})[0], 412)
        tag = self.api("GET", "/api/records/805")[2]["ETag"]
        self.assertEqual(self.api("PATCH", "/api/records/805", "writer",
                                  {"status": "draft"}, {"If-Match": tag})[0], 403)
        self.assertEqual(self.api("DELETE", "/api/records/3", "writer")[0], 405)
        self.assertEqual(self.api("POST", "/api/records", "writer", {"name": "unsafe"})[0], 405)

    def test_04_concurrent_if_match_only_one_winner(self):
        original = self.api("GET", "/api/records/4")[2]["ETag"]
        def update(_):
            return self.api("PATCH", "/api/records/4", "writer",
                            {"status": "evaluated"}, {"If-Match": original})[0]
        with ThreadPoolExecutor(max_workers=8) as pool:
            outcomes = list(pool.map(update, range(8)))
        self.assertEqual(sorted(outcomes), [200] + [412] * 7)

    def test_05_writes_disabled_by_default(self):
        # This test isolates the "writes disabled" authorization gate. A denied
        # PATCH with an unread request body may produce a Windows TCP RST
        # (WinError 10053) instead of exposing the server's 403. Other tests
        # cover normal JSON PATCH payloads, so send no body here and assert
        # the same strict HTTP 403 plus absence of SQLite side effects.
        with closing(sqlite3.connect(self.db)) as conn:
            before = conn.execute(
                "SELECT status,evaluation_count FROM models WHERE id=3").fetchone()
        safe = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.db, ORIGIN, READER, WRITER))
        worker = threading.Thread(target=safe.serve_forever, daemon=True)
        worker.start()
        try:
            req = Request(f"http://127.0.0.1:{safe.server_port}/api/records/3",
                          method="PATCH",
                          headers={"Authorization": "Bearer " + WRITER,
                                   "If-Match": '"' + "0" * 64 + '"'})
            with self.assertRaises(HTTPError) as raised:
                urlopen(req, timeout=5)
            self.assertEqual(raised.exception.code, 403)
            with closing(sqlite3.connect(self.db)) as conn:
                after = conn.execute(
                    "SELECT status,evaluation_count FROM models WHERE id=3").fetchone()
            self.assertEqual(after, before, "Disabled native status writes modified SQLite")
        finally:
            safe.shutdown()
            safe.server_close()
            worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
