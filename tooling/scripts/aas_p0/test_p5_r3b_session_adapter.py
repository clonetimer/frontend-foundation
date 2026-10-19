"""HTTP integration for disposable, same-origin R3b2 cookie/CSRF session bridge."""
from __future__ import annotations

import concurrent.futures
import json
import socket
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from p5_r3b_scoped_reference import create_fixture
from p5_r3b_session_adapter import (
    COOKIE_NAME, CSRF_HEADER, SyntheticSessionStore, cookie_attributes,
    make_session_handler,
)

NOW = 2_000_000_000
KEY = "r3b2_cookie_session_retry_001"


def identity(tenant="tenant-a", subject="alice", role="writer", epoch=None):
    return {
        "tenantId": tenant, "subjectId": subject, "role": role,
        "sessionEpoch": epoch or "11111111-1111-4111-8111-111111111111",
    }


class CookieScopedLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="p5_r3b2_cookie_test_")
        self.path = str(Path(self.temp.name) / "isolated.sqlite")
        create_fixture(self.path)
        self.now = NOW
        self.sessions = SyntheticSessionStore(clock=lambda: self.now, ttl_seconds=3600)
        self.alice = self.sessions.issue(identity())
        self.bob = self.sessions.issue(identity("tenant-b", "bob"))
        self.reader = self.sessions.issue(identity("tenant-a", "reader", "reader"))
        self.fault = {}
        # Test only: reserve a random loopback port so the handler's Host
        # guard and browser origin are actually the SAME scheme/host/port.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self.origin = f"http://127.0.0.1:{port}"
        self.server = ThreadingHTTPServer(("127.0.0.1", port),
            make_session_handler(self.path, self.origin, self.sessions,
                                 clock=lambda: self.now, fault=self.fault))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp.cleanup()

    def call(self, method, path, *, cookie=None, body=None, origin=None,
             headers=None, fetch_site="same-origin"):
        auth_headers = {"Sec-Fetch-Site": fetch_site}
        if cookie:
            auth_headers["Cookie"] = COOKIE_NAME + "=" + cookie
        if origin is not None:
            auth_headers["Origin"] = origin
        if body is not None:
            auth_headers["Content-Type"] = "application/json"
        auth_headers.update(headers or {})
        req = Request(self.origin + path, method=method, data=body,
                      headers=auth_headers)
        try:
            with urlopen(req, timeout=12) as result:
                return result.status, json.load(result), result.headers
        except HTTPError as error:
            with error:
                return error.code, json.load(error), error.headers

    def current(self, cookie=None):
        code, data, _ = self.call("GET", "/api/session", cookie=cookie or self.alice)
        self.assertEqual(code, 200)
        return data

    def capacity(self, cookie=None):
        code, data, headers = self.call("GET",
            "/.well-known/foundation-idempotent-write/v1",
            cookie=cookie or self.alice)
        self.assertEqual(code, 200)
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        return data

    def patch_headers(self, cookie=None):
        current = self.current(cookie)
        capability = self.capacity(cookie)
        self.assertEqual(capability["scope"]["tenantId"], current["identity"]["tenantId"])
        return {
            CSRF_HEADER: current["csrfToken"],
            "Idempotency-Key": KEY,
            "If-Match": self.call("GET", "/api/tasks/1",
                                  cookie=cookie or self.alice)[2]["ETag"],
            "X-P5-Provider-Id": capability["providerId"],
            "X-P5-Receipt-Epoch": capability["receiptEpoch"],
        }

    def patch(self, *, cookie=None, headers=None, key=KEY, state="approved"):
        values = dict(headers or self.patch_headers(cookie))
        values["Idempotency-Key"] = key
        return self.call("PATCH", "/api/tasks/1", cookie=cookie or self.alice,
                         origin=self.origin, headers=values,
                         body=json.dumps({"status": state}, separators=(",", ":")).encode())

    def scalar(self, sql):
        with closing(sqlite3.connect(self.path)) as db:
            return db.execute(sql).fetchone()[0]

    def test_01_explicit_privileged_session_provisioning_and_cookie_properties(self):
        session = self.current()
        self.assertEqual(session["identity"], identity())
        self.assertGreaterEqual(len(session["csrfToken"]), 32)
        self.assertEqual(self.call("GET", "/api/session")[0], 401)
        self.assertEqual(self.call("GET", "/api/session", headers={
            "Authorization": "Bearer " + "fake" * 16,
            "X-User-Id": "alice", "X-Tenant-Id": "tenant-a"
        })[0], 401)
        attributes = cookie_attributes(self.origin)
        self.assertIn("HttpOnly", attributes)
        self.assertIn("SameSite=Strict", attributes)
        self.assertIn("Path=/", attributes)
        self.assertNotIn("Domain=", attributes)
        self.assertNotIn("Secure", attributes)  # loopback development only
        self.assertFalse(hasattr(self.sessions, "login_http"))

    def test_02_capability_discovery_uses_host_only_cookie_without_origin_header(self):
        result = self.capacity()
        self.assertEqual(result["contract"], "foundation.idempotent-write/v1")
        self.assertEqual(result["scope"], {
            "tenantId": "tenant-a", "subjectId": "alice"
        })
        self.assertEqual(result["routes"][0]["method"], "PATCH")
        self.assertTrue(all(result["guarantees"].values()))
        self.assertEqual(self.call("GET", "/api/session",
                                  cookie=self.alice, origin="http://attacker.test")[0], 403)
        self.assertEqual(self.call("GET", "/api/session",
                                  cookie=self.alice, fetch_site="cross-site")[0], 403)
        self.assertEqual(self.call("GET", "/api/session", cookie=self.alice,
                                  headers={"Host": "evil.test"})[0], 403)

    def test_03_csrf_rejects_foreign_session_missing_token_and_wrong_origin(self):
        good = self.patch_headers()
        for mutations in [
            {CSRF_HEADER: ""},
            {CSRF_HEADER: self.current(self.bob)["csrfToken"]},
            {CSRF_HEADER: "forged" * 10},
        ]:
            wrong = dict(good, **mutations)
            # Authentication guard must run before JSON parsing or touching DB.
            self.assertEqual(self.call("PATCH", "/api/tasks/1",
                                       cookie=self.alice, origin=self.origin,
                                       headers=wrong)[0], 403)
        self.assertEqual(self.call("PATCH", "/api/tasks/1",
                                   cookie=self.alice, headers=good)[0], 403)
        self.assertEqual(self.call("PATCH", "/api/tasks/1", cookie=self.alice,
                                   origin="http://attacker.test", headers=good)[0], 403)
        self.assertEqual(self.call("PATCH", "/api/tasks/1", cookie=self.alice,
                                   origin=self.origin, headers=good,
                                   fetch_site="cross-site")[0], 403)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM receipts"), 0)
        self.assertEqual(self.scalar(
            "SELECT version FROM tasks WHERE tenant_id='tenant-a'"), 1)

    def test_04_503_commit_cookie_rotation_and_original_key_recovery(self):
        old_headers = self.patch_headers()
        self.fault["commit_then_503_once"] = True
        self.assertEqual(self.patch(headers=old_headers)[0], 503)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM receipts"), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM spent_keys"), 1)
        self.assertEqual(self.scalar(
            "SELECT version FROM tasks WHERE tenant_id='tenant-a'"), 2)
        old_cookie = self.alice
        self.alice = self.sessions.rotate(old_cookie)
        self.assertEqual(self.call("GET", "/api/session", cookie=old_cookie)[0], 401)
        new_csrf = self.current()["csrfToken"]
        self.assertNotEqual(new_csrf, old_headers[CSRF_HEADER])
        self.assertEqual(self.call("GET", "/api/mutations/" + KEY,
             cookie=self.alice,
             headers={"X-P5-Provider-Id": old_headers["X-P5-Provider-Id"],
                      "X-P5-Receipt-Epoch": old_headers["X-P5-Receipt-Epoch"]})[0], 200)
        replay_headers = dict(old_headers, **{CSRF_HEADER: new_csrf})
        replay = self.patch(headers=replay_headers)
        self.assertEqual(replay[0], 200)
        self.assertEqual(replay[2]["Idempotency-Replayed"], "true")
        self.assertEqual(self.scalar(
            "SELECT version FROM tasks WHERE tenant_id='tenant-a'"), 2)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM audit_events"), 1)

    def test_05_role_change_and_revocation_block_mutations_and_receipt_queries(self):
        h = self.patch_headers()
        self.assertEqual(self.patch(headers=h)[0], 200)
        self.sessions.change_role(self.alice, "reader")
        self.assertEqual(self.call("GET", "/api/mutations/" + KEY,
           cookie=self.alice, headers={
              "X-P5-Provider-Id": h["X-P5-Provider-Id"],
              "X-P5-Receipt-Epoch": h["X-P5-Receipt-Epoch"]
           })[0], 403)
        self.assertEqual(self.call("PATCH", "/api/tasks/1",
            cookie=self.alice, origin=self.origin, headers=h)[0], 403)
        self.sessions.revoke(self.alice)
        self.assertEqual(self.call("GET", "/api/session", cookie=self.alice)[0], 401)
        self.assertEqual(self.call("GET", "/api/session", cookie=self.reader)[0], 200)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM receipts"), 1)

    def test_06_cookie_tampering_duplicates_and_session_expiration_fail_closed(self):
        valid = self.alice
        self.assertEqual(self.call("GET", "/api/session",
                                  cookie=valid + "tampered")[0], 401)
        self.assertEqual(self.call("GET", "/api/session", headers={
            "Cookie": COOKIE_NAME + "=" + valid + "; " + COOKIE_NAME + "=" + valid
        })[0], 401)
        self.assertEqual(self.call("GET", "/api/session", headers={
            "Cookie": COOKIE_NAME + "=%0a" + valid
        })[0], 401)
        self.now += 3600
        self.assertEqual(self.call("GET", "/api/session", cookie=valid)[0], 401)
        with self.assertRaises(ValueError):
            self.sessions.rotate(valid)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM receipts"), 0)

    def test_07_scoped_browser_cookie_cannot_read_another_tenants_receipt(self):
        h = self.patch_headers()
        self.assertEqual(self.patch(headers=h)[0], 200)
        bob_headers = self.patch_headers(self.bob)
        query = {
            "X-P5-Provider-Id": bob_headers["X-P5-Provider-Id"],
            "X-P5-Receipt-Epoch": bob_headers["X-P5-Receipt-Epoch"]
        }
        self.assertEqual(self.call("GET", "/api/mutations/" + KEY,
                                   cookie=self.bob, headers=query)[0], 404)
        self.assertEqual(self.call("GET", "/api/tasks/1",
                                   cookie=self.bob)[1]["data"]["status"], "draft")
        self.assertEqual(self.call("GET", "/api/tasks/1",
                                   cookie=self.alice)[1]["data"]["status"], "approved")
        self.assertNotEqual(self.current()["identity"]["tenantId"],
                            self.current(self.bob)["identity"]["tenantId"])

    def test_08_concurrent_session_based_same_key_patch_only_commits_once(self):
        h = self.patch_headers()
        def submit(_):
            return self.patch(headers=h)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            replies = list(pool.map(submit, range(8)))
        self.assertEqual([r[0] for r in replies], [200] * 8)
        self.assertEqual(self.scalar(
            "SELECT version FROM tasks WHERE tenant_id='tenant-a'"), 2)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM receipts"), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM spent_keys"), 1)

    def test_09_cookie_session_is_not_saved_in_ledger_or_audit(self):
        h = self.patch_headers()
        self.assertEqual(self.patch(headers=h)[0], 200)
        with closing(sqlite3.connect(self.path)) as db:
            dump = "\n".join(db.iterdump())
        for secret in (self.alice, self.bob, h[CSRF_HEADER], KEY):
            self.assertNotIn(secret, dump)
        self.assertEqual(self.call("GET", "/api/session", cookie=self.alice)[0], 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
