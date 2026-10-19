"""P5-R3b1 HTTP + real SQLite transactions: synthetic identity/ledger contract."""
import concurrent.futures
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from p5_r3b_scoped_reference import (
    RETENTION_SECONDS, create_fixture, make_handler, rotate_epoch_and_gc,
    verify_fixture,
)

ORIGIN = "http://127.0.0.1:5117"
TOKEN_A = "p5_r3b_user_a_" + "a" * 44
TOKEN_ROTATED = "p5_r3b_user_a_rotation_" + "r" * 42
TOKEN_B = "p5_r3b_tenant_b_" + "b" * 44
TOKEN_A_OTHER = "p5_r3b_other_actor_" + "c" * 44
TOKEN_READ = "p5_r3b_reader_" + "d" * 44
KEY = "r3b_key_replay_test_001"
SESSION = "11111111-1111-4111-8111-111111111111"
NOW = 2_000_000_000


def actor(tenant, subject, role="writer"):
    return {
        "tenantId": tenant, "subjectId": subject,
        "sessionEpoch": SESSION, "role": role
    }


class ScopedNativeLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="p5_r3b_disposable_")
        self.db = str(Path(self.temp.name) / "synthetic.db")
        create_fixture(self.db)
        self.identities = {
            TOKEN_A: actor("tenant-a", "alice"),
            TOKEN_B: actor("tenant-b", "bob"),
            TOKEN_A_OTHER: actor("tenant-a", "charlie"),
            TOKEN_READ: actor("tenant-a", "readonly", "reader")
        }
        self.time = NOW
        self.fault = {}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0),
            make_handler(self.db, ORIGIN, self.identities,
                         clock=lambda: self.time, fault=self.fault))
        self.root = "http://127.0.0.1:" + str(self.server.server_port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def request(self, method, path, *, token=TOKEN_A, body=None, headers=None,
                origin=ORIGIN):
        h = {"Origin": origin}
        if token:
            h["Authorization"] = "Bearer " + token
        if body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        req = Request(self.root + path, method=method, headers=h, data=body)
        try:
            with urlopen(req, timeout=12) as response:
                return response.status, json.load(response), response.headers
        except HTTPError as e:
            with e:
                return e.code, json.load(e), e.headers

    def capability(self, token=TOKEN_A):
        status, response, headers = self.request(
            "GET", "/.well-known/foundation-idempotent-write/v1", token=token)
        self.assertEqual(status, 200)
        self.assertIn("no-store", headers["Cache-Control"])
        return response

    def gated(self, token=TOKEN_A):
        cap = self.capability(token)
        return {
            "X-P5-Provider-Id": cap["providerId"],
            "X-P5-Receipt-Epoch": cap["receiptEpoch"]
        }

    def patch(self, key, *, token=TOKEN_A, state="approved",
              etag=None, headers=None, record=1):
        if etag is None:
            etag = self.request("GET", f"/api/tasks/{record}", token=token)[2]["ETag"]
        h = {"If-Match": etag, "Idempotency-Key": key}
        h.update(headers if headers is not None else self.gated(token))
        return self.request("PATCH", f"/api/tasks/{record}", token=token,
                            body=json.dumps({"status": state}, separators=(",", ":")).encode(),
                            headers=h)

    def rows(self, sql, args=()):
        with closing(sqlite3.connect(self.db)) as db:
            return db.execute(sql, args).fetchall()

    def test_01_no_existing_or_foreign_database_can_be_migrated(self):
        with self.assertRaises(ValueError):
            create_fixture(self.db)
        other = str(Path(self.temp.name) / "business.sqlite")
        with closing(sqlite3.connect(other)) as db, db:
            db.execute("CREATE TABLE tasks (id INTEGER PRIMARY KEY)")
        with self.assertRaises((ValueError, sqlite3.Error)):
            verify_fixture(other)
        with self.assertRaises((ValueError, sqlite3.Error)):
            make_handler(other, ORIGIN, self.identities)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM tasks")[0][0], 2)

    def test_02_authenticated_scoped_capability_is_real_and_bounded(self):
        a, b = self.capability(), self.capability(TOKEN_B)
        self.assertEqual(a["contract"], "foundation.idempotent-write/v1")
        self.assertEqual(a["scope"], {"tenantId": "tenant-a", "subjectId": "alice"})
        self.assertEqual(b["scope"], {"tenantId": "tenant-b", "subjectId": "bob"})
        self.assertEqual(a["providerId"], b["providerId"])
        self.assertEqual(a["receiptEpoch"], b["receiptEpoch"])
        self.assertEqual(a["minReceiptRetentionSeconds"], RETENTION_SECONDS)
        self.assertEqual(a["routes"], [{
            "method": "PATCH", "path": "/api/tasks/{id}",
            "receiptPath": "/api/mutations/{key}"
        }])
        self.assertTrue(all(a["guarantees"].values()))
        self.assertEqual(self.request("GET", "/.well-known/foundation-idempotent-write/v1",
                                      token=None)[0], 401)
        self.assertEqual(self.request("GET", "/.well-known/foundation-idempotent-write/v1",
                                      origin="http://attacker.test")[0], 403)

    def test_03_tenants_share_numeric_id_without_leaking_data(self):
        head_a = self.gated()
        etag_a = self.request("GET", "/api/tasks/1")[2]["ETag"]
        status, response, _ = self.patch(KEY, etag=etag_a, headers=head_a)
        self.assertEqual(status, 200)
        self.assertEqual(response["data"]["tenant_id"], "tenant-a")
        self.assertEqual(self.request("GET", "/api/tasks/1", token=TOKEN_B)[1]["data"]["status"], "draft")
        self.assertEqual(self.request("GET", "/api/tasks/1")[1]["data"]["status"], "approved")
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY,
                                      token=TOKEN_B, headers=self.gated(TOKEN_B))[0], 404)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY,
                                      token=TOKEN_A_OTHER, headers=self.gated(TOKEN_A_OTHER))[0], 404)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM receipts")[0][0], 1)

    def test_04_committed_then_503_token_rotation_and_restart_safe_receipt(self):
        self.fault["commit_then_503_once"] = True
        gated = self.gated()
        original_etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        self.assertEqual(self.patch(KEY, etag=original_etag, headers=gated)[0], 503)
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 2)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM receipts")[0][0], 1)
        self.identities[TOKEN_ROTATED] = self.identities.pop(TOKEN_A)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, headers=gated)[0], 401)
        status, receipt, _ = self.request("GET", "/api/mutations/" + KEY,
                                          token=TOKEN_ROTATED, headers=gated)
        self.assertEqual(status, 200)
        self.assertEqual(receipt["response"]["data"]["status"], "approved")
        replay = self.patch(KEY, token=TOKEN_ROTATED, etag=original_etag, headers=gated)
        self.assertEqual(replay[0], 200)
        self.assertEqual(replay[2]["Idempotency-Replayed"], "true")
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 2)
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0),
            make_handler(self.db, ORIGIN, self.identities,
                         clock=lambda: self.time, fault=self.fault))
        self.root = "http://127.0.0.1:" + str(self.server.server_port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY,
                                      token=TOKEN_ROTATED, headers=gated)[0], 200)

    def test_05_parallel_duplicate_original_key_commits_once(self):
        gate = self.gated()
        etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        def perform(_):
            return self.patch(KEY, etag=etag, headers=gate)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            replies = list(executor.map(perform, range(8)))
        self.assertEqual([r[0] for r in replies], [200] * 8)
        self.assertEqual(sum(r[2].get("Idempotency-Replayed") == "true"
                             for r in replies), 7)
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 2)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM receipts")[0][0], 1)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM spent_keys")[0][0], 1)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM audit_events WHERE event='committed'")[0][0], 1)

    def test_06_distinct_keys_conflict_and_same_key_changed_intent_rejected(self):
        gate = self.gated()
        etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        def perform(index):
            return self.patch("r3b_distinct_key_0" + str(index).zfill(2),
                              state="approved" if index % 2 else "archived",
                              etag=etag, headers=gate)[0]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(perform, range(8)))
        self.assertEqual(sorted(results), [200] + [412] * 7)
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 2)
        original_key = "r3b_distinct_key_0" + str(results.index(200)).zfill(2)
        changed = self.patch(original_key, state="draft", etag=etag, headers=gate)
        self.assertEqual(changed[0], 409)

    def test_07_retention_gc_rotates_epoch_and_tombstones_old_keys(self):
        gate = self.gated()
        etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        self.assertEqual(self.patch(KEY, etag=etag, headers=gate)[0], 200)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM audit_events")[0][0], 1)
        first = rotate_epoch_and_gc(self.db, expected_epoch=gate["X-P5-Receipt-Epoch"],
                                    now=self.time + RETENTION_SECONDS)
        self.assertEqual(first["deletedReceipts"], 0)  # exactly at min TTL is retained
        self.assertFalse(first["invalidatedPriorEpoch"])
        second = rotate_epoch_and_gc(self.db, expected_epoch=gate["X-P5-Receipt-Epoch"],
                                     now=self.time + RETENTION_SECONDS + 1)
        self.assertEqual(second["deletedReceipts"], 1)
        self.assertNotEqual(second["receiptEpoch"], gate["X-P5-Receipt-Epoch"])
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, headers=gate)[0], 409)
        refreshed = self.gated()
        self.assertEqual(refreshed["X-P5-Receipt-Epoch"], second["receiptEpoch"])
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, headers=refreshed)[0], 410)
        new_etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        self.assertEqual(self.patch(KEY, etag=new_etag, headers=refreshed)[0], 409)
        self.assertEqual(self.patch("r3b_genuine_new_key_888", etag=new_etag,
                                    headers=refreshed)[0], 200)
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 3)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM spent_keys")[0][0], 2)
        with self.assertRaises(ValueError):
            rotate_epoch_and_gc(self.db, expected_epoch=gate["X-P5-Receipt-Epoch"],
                                now=self.time + RETENTION_SECONDS + 1000)

    def test_08_revoked_or_downgraded_identity_cannot_recover(self):
        gate = self.gated()
        self.assertEqual(self.patch(KEY, headers=gate)[0], 200)
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY,
                                      token=TOKEN_READ, headers=gate)[0], 403)
        self.identities[TOKEN_A]["role"] = "reader"
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, headers=gate)[0], 403)
        self.assertEqual(self.request("PATCH", "/api/tasks/1", headers=gate)[0], 403)
        del self.identities[TOKEN_A]
        self.assertEqual(self.request("GET", "/api/mutations/" + KEY, headers=gate)[0], 401)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM receipts")[0][0], 1)

    def test_09_wrong_epoch_and_provider_refuse_to_send_writes(self):
        gate = self.gated()
        etag = self.request("GET", "/api/tasks/1")[2]["ETag"]
        for key, new in [
            ("X-P5-Receipt-Epoch", str(uuid.uuid4())),
            ("X-P5-Provider-Id", str(uuid.uuid4()))
        ]:
            altered = dict(gate, **{key: new})
            self.assertEqual(self.patch(KEY, etag=etag, headers=altered)[0], 409)
            self.assertEqual(self.request("GET", "/api/mutations/" + KEY,
                                          headers=altered)[0], 409)
        self.assertEqual(self.rows("SELECT version FROM tasks WHERE tenant_id='tenant-a'")[0][0], 1)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM receipts")[0][0], 0)

    def test_10_no_token_material_in_receipt_or_audit_and_unsupported_mutations(self):
        gate = self.gated()
        self.assertEqual(self.patch(KEY, headers=gate)[0], 200)
        with closing(sqlite3.connect(self.db)) as conn:
            text_rows = "\n".join(map(str, conn.iterdump()))
        for value in (TOKEN_A, TOKEN_B, TOKEN_READ, KEY):
            self.assertNotIn(value, text_rows)
        self.assertEqual(self.request("POST", "/api/tasks", headers=gate)[0], 405)
        self.assertEqual(self.request("DELETE", "/api/tasks/1", headers=gate)[0], 405)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM tasks")[0][0], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
