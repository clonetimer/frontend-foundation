#!/usr/bin/env python3
"""P5-R3b1 disposable, tenant-scoped HTTP/SQLite protocol REFERENCE.

Never a production identity provider, business API or AAS database migration.
Only new marker-bearing fixture files are accepted. Identity is resolved from
an in-process, test-only token registry owned by the caller (not from HTTP).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
import time
import uuid
from contextlib import closing
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

from secure_records import loopback_origin

MARKER = "foundation-p5-r3b1-disposable-tenant-ledger"
CONTRACT = "foundation.idempotent-write/v1"
CAPABILITY_PATH = "/.well-known/foundation-idempotent-write/v1"
RETENTION_SECONDS = 7 * 86400
KEY = re.compile(r"[A-Za-z0-9_-]{16,128}\Z")
ID = re.compile(r"/api/tasks/([1-9][0-9]{0,9})\Z")
RECEIPT = re.compile(r"/api/mutations/([A-Za-z0-9_-]{16,128})\Z")
STRONG_ETAG = re.compile(r'"[0-9a-f]{64}"\Z')
IDENTITY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}\Z")
STATES = frozenset({"draft", "approved", "archived"})


def _digest(raw):
    return hashlib.sha256(raw).hexdigest()


def create_fixture(path):
    """Create an NEW synthetic DB; an existing DB is never opened or migrated."""
    target = Path(path)
    if target.exists() or target.suffix.lower() not in (".db", ".sqlite", ".sqlite3"):
        raise ValueError("A NEW synthetic .db/.sqlite/.sqlite3 path is required")
    if not target.parent.is_dir():
        raise ValueError("Fixture parent directory must already exist")
    with closing(sqlite3.connect(target)) as conn, conn:
        conn.execute("CREATE TABLE fixture_marker (marker TEXT NOT NULL)")
        conn.execute("INSERT INTO fixture_marker VALUES (?)", (MARKER,))
        conn.execute("CREATE TABLE ledger_meta (provider_id TEXT NOT NULL, receipt_epoch TEXT NOT NULL)")
        conn.execute("INSERT INTO ledger_meta VALUES (?,?)", (str(uuid.uuid4()), str(uuid.uuid4())))
        conn.execute("""CREATE TABLE tasks (
            tenant_id TEXT NOT NULL, id INTEGER NOT NULL,
            status TEXT NOT NULL, version INTEGER NOT NULL,
            PRIMARY KEY(tenant_id,id))""")
        conn.executemany("INSERT INTO tasks VALUES (?,?,?,?)", [
            ("tenant-a", 1, "draft", 1), ("tenant-b", 1, "draft", 1)])
        conn.execute("""CREATE TABLE receipts (
            tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, request_key_hash TEXT NOT NULL,
            fingerprint TEXT NOT NULL, record_id INTEGER NOT NULL,
            response_json TEXT NOT NULL, response_etag TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(tenant_id,subject_id,request_key_hash))""")
        # Tombstones are written atomically with task mutations; GC never deletes
        # them. Expired original keys cannot become fresh writes after receipt GC.
        conn.execute("""CREATE TABLE spent_keys (
            tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL,
            request_key_hash TEXT NOT NULL,
            PRIMARY KEY(tenant_id,subject_id,request_key_hash))""")
        conn.execute("""CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL,
            request_key_hash TEXT NOT NULL, created_at INTEGER NOT NULL)""")
    return target


def _connect(path):
    conn = sqlite3.connect(f"file:{path}?mode=rw", uri=True, isolation_level=None, timeout=8)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=8000")
    return conn


def verify_fixture(path):
    database = Path(path).resolve(strict=True)
    if not database.is_file() or database.suffix.lower() not in (".db", ".sqlite", ".sqlite3"):
        raise ValueError("Existing disposable SQLite fixture required")
    with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as conn:
        marker = conn.execute("SELECT marker FROM fixture_marker").fetchone()
        if marker != (MARKER,):
            raise ValueError("Refusing non-P5-R3b1 fixture database")
        for name in ("tasks", "receipts", "spent_keys", "ledger_meta", "audit_events"):
            if not conn.execute("SELECT 1 FROM sqlite_master WHERE name=? AND type='table'",
                                (name,)).fetchone():
                raise ValueError("Missing P5-R3b1 schema")
        if conn.execute("SELECT COUNT(*) FROM ledger_meta").fetchone()[0] != 1:
            raise ValueError("Invalid ledger metadata")
    return database


def _metadata(conn):
    row = conn.execute("SELECT provider_id,receipt_epoch FROM ledger_meta").fetchone()
    return dict(row)


def _etag(row):
    canonical = json.dumps(dict(row), sort_keys=True, separators=(",", ":"))
    return '"' + _digest(canonical.encode()) + '"'


def _fingerprint(path, etag, body, epoch):
    return _digest(b"PATCH\n" + path.encode() + b"\n" + etag.encode()
                   + b"\n" + epoch.encode() + b"\n" + body)


def _validate_actor(actor):
    if not isinstance(actor, dict) or any(
        not isinstance(actor.get(field), str)
        or not IDENTITY.fullmatch(actor[field])
        for field in ("tenantId", "subjectId")
    ):
        raise ValueError("Trusted synthetic tenant and subject are required")
    try:
        if str(uuid.UUID(actor["sessionEpoch"])) != actor["sessionEpoch"]:
            raise ValueError("Invalid synthetic session epoch")
    except (KeyError, ValueError, AttributeError):
        raise ValueError("Valid host-authenticated session epoch required") from None
    if actor.get("role") not in ("reader", "writer"):
        raise ValueError("Synthetic role required")
    return actor


def rotate_epoch_and_gc(path, *, expected_epoch, now):
    """Explicit operator-only maintenance; globally invalidates old clients.

    GC removes only response bodies beyond retention; persistent spent-key
    tombstones are never removed. Even after epoch rotation the same key cannot
    silently apply again. There is deliberately NO HTTP endpoint for this.
    """
    database = verify_fixture(path)
    if not isinstance(now, int) or now <= RETENTION_SECONDS:
        raise ValueError("Explicit positive maintenance clock required")
    with closing(_connect(database)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            meta = _metadata(conn)
            if meta["receipt_epoch"] != expected_epoch:
                raise ValueError("Receipt epoch changed: abort GC")
            cutoff = now - RETENTION_SECONDS
            count = conn.execute(
                "SELECT COUNT(*) FROM receipts WHERE created_at < ?", (cutoff,)).fetchone()[0]
            if count:
                conn.execute("DELETE FROM receipts WHERE created_at < ?", (cutoff,))
                revised = str(uuid.uuid4())
                conn.execute("UPDATE ledger_meta SET receipt_epoch=?", (revised,))
                conn.execute("""INSERT INTO audit_events
                    (event,tenant_id,subject_id,request_key_hash,created_at)
                    VALUES ('epoch-rotated-gc','_system','_system','',?)""", (now,))
            else:
                revised = expected_epoch
            conn.commit()
            return {"deletedReceipts": count, "receiptEpoch": revised,
                    "invalidatedPriorEpoch": bool(count)}
        except BaseException:
            conn.rollback()
            raise


def make_handler(db_path, app_origin, token_sessions, *, clock=time.time, fault=None):
    """Test gateway: mutable in-process bearer->actor mapping simulates an IdP."""
    database = verify_fixture(db_path)
    origin = loopback_origin(app_origin)
    if not isinstance(token_sessions, dict) or not token_sessions:
        raise ValueError("Explicit test session registry required")
    for bearer, actor in token_sessions.items():
        if not isinstance(bearer, str) or not 32 <= len(bearer) <= 4096:
            raise ValueError("Synthetic token length invalid")
        _validate_actor(actor)

    class Handler(BaseHTTPRequestHandler):
        server_version = "FoundationP5R3b1Fixture/1"

        def log_message(self, *_args):
            pass  # Never log Authorization, raw bodies, identities or keys.

        def send(self, status, body, *, etag=None, replay=False):
            raw = json.dumps(body, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Vary", "Origin")
            if etag:
                self.send_header("ETag", etag)
            if replay:
                self.send_header("Idempotency-Replayed", "true")
            if self.headers.get("Origin") == origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Access-Control-Expose-Headers", "ETag,Idempotency-Replayed")
            self.end_headers()
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authenticate(self, *, writer=False):
            if self.headers.get("Origin") != origin:
                self.send(403, {"error": "Untrusted origin"})
                return None
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                self.send(401, {"error": "Host authentication required"})
                return None
            supplied = header[7:]
            actor = None
            # Test identity provider owns this mapping and may revoke/rotate
            # bearer secrets between calls without changing tenant+subject.
            for secret, identity in tuple(token_sessions.items()):
                if hmac.compare_digest(supplied, secret):
                    actor = identity
            if actor is None:
                self.send(401, {"error": "Session unavailable"})
                return None
            if writer and actor["role"] != "writer":
                self.send(403, {"error": "Writer permission required"})
                return None
            return actor

        def guard_epoch(self, conn):
            meta = _metadata(conn)
            if (self.headers.get("X-P5-Provider-Id") != meta["provider_id"]
                    or self.headers.get("X-P5-Receipt-Epoch") != meta["receipt_epoch"]):
                self.send(409, {"error": "Provider or receipt epoch changed; investigate pending writes"})
                return None
            return meta

        def do_OPTIONS(self):
            if self.headers.get("Origin") != origin:
                return self.send(403, {"error": "Untrusted origin"})
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Allow-Methods", "GET,PATCH,OPTIONS")
            self.send_header("Access-Control-Allow-Headers",
                             "Authorization,Content-Type,If-Match,Idempotency-Key,"
                             "X-P5-Provider-Id,X-P5-Receipt-Epoch")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_GET(self):
            actor = self.authenticate()
            if actor is None:
                return
            url = urlsplit(self.path)
            if url.query or url.fragment:
                return self.send(404, {"error": "Not found"})
            if url.path == CAPABILITY_PATH:
                with closing(_connect(database)) as conn:
                    meta = _metadata(conn)
                return self.send(200, {
                    "contract": CONTRACT, "providerId": meta["provider_id"],
                    "receiptEpoch": meta["receipt_epoch"],
                    "scope": {"tenantId": actor["tenantId"], "subjectId": actor["subjectId"]},
                    "guarantees": {
                        "atomicMutationAndReceipt": True, "sameKeySameIntentReplay": True,
                        "authenticatedReceiptLookup": True, "principalScopedKeys": True,
                        "conditionalMutation": True
                    },
                    "minReceiptRetentionSeconds": RETENTION_SECONDS,
                    "routes": [{
                        "method": "PATCH", "path": "/api/tasks/{id}",
                        "receiptPath": "/api/mutations/{key}"
                    }]
                })
            match = ID.fullmatch(url.path)
            receipt = RECEIPT.fullmatch(url.path)
            if not match and not receipt:
                return self.send(404, {"error": "Not found"})
            if receipt and actor["role"] != "writer":
                return self.send(403, {"error": "Writer permission required"})
            with closing(_connect(database)) as conn:
                if receipt and not self.guard_epoch(conn):
                    return
                if match:
                    task = conn.execute("SELECT * FROM tasks WHERE tenant_id=? AND id=?",
                                        (actor["tenantId"], int(match.group(1)))).fetchone()
                    return self.send(200, {"data": dict(task)}, etag=_etag(task)) if task \
                        else self.send(404, {"error": "Not found"})
                key_hash = _digest(receipt.group(1).encode())
                row = conn.execute("""SELECT response_json,record_id FROM receipts WHERE
                    tenant_id=? AND subject_id=? AND request_key_hash=?""",
                    (actor["tenantId"], actor["subjectId"], key_hash)).fetchone()
                if row:
                    return self.send(200, {"status": "committed",
                        "recordId": row["record_id"], "response": json.loads(row["response_json"])})
                spent = conn.execute("""SELECT 1 FROM spent_keys WHERE
                    tenant_id=? AND subject_id=? AND request_key_hash=?""",
                    (actor["tenantId"], actor["subjectId"], key_hash)).fetchone()
                return self.send(410 if spent else 404, {
                    "status": "expired" if spent else "not_found"})

        def do_PATCH(self):
            actor = self.authenticate(writer=True)
            if actor is None:
                return
            url = urlsplit(self.path)
            match = ID.fullmatch(url.path) if not url.query and not url.fragment else None
            if not match:
                return self.send(404, {"error": "Not found"})
            req_key = self.headers.get("Idempotency-Key", "")
            previous = self.headers.get("If-Match", "")
            if not KEY.fullmatch(req_key) or not STRONG_ETAG.fullmatch(previous):
                return self.send(428, {"error": "Strong If-Match and original key required"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.send(415, {"error": "JSON required"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 2 <= size <= 512:
                    return self.send(413, {"error": "Invalid body size"})
                raw = self.rfile.read(size)
                body = json.loads(raw)
                if not isinstance(body, dict) or set(body) != {"status"} or body["status"] not in STATES:
                    return self.send(422, {"error": "Status-only mutation required"})
            except (ValueError, UnicodeError, json.JSONDecodeError):
                return self.send(400, {"error": "Invalid request"})
            record_id = int(match.group(1))
            key_hash = _digest(req_key.encode())
            with closing(_connect(database)) as conn:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    meta = self.guard_epoch(conn)
                    if meta is None:
                        conn.rollback()
                        return
                    fp = _fingerprint(url.path, previous, raw, meta["receipt_epoch"])
                    args = (actor["tenantId"], actor["subjectId"], key_hash)
                    existing = conn.execute("""SELECT * FROM receipts WHERE tenant_id=?
                        AND subject_id=? AND request_key_hash=?""", args).fetchone()
                    if existing:
                        if not hmac.compare_digest(existing["fingerprint"], fp):
                            conn.rollback()
                            return self.send(409, {"error": "Same key, different intent"})
                        result, tag = json.loads(existing["response_json"]), existing["response_etag"]
                        conn.rollback()
                        return self.send(200, result, etag=tag, replay=True)
                    if conn.execute("""SELECT 1 FROM spent_keys WHERE tenant_id=?
                        AND subject_id=? AND request_key_hash=?""", args).fetchone():
                        conn.rollback()
                        return self.send(409, {"error": "Spent key: manual reconciliation required"})
                    task = conn.execute("SELECT * FROM tasks WHERE tenant_id=? AND id=?",
                                        (actor["tenantId"], record_id)).fetchone()
                    if not task:
                        conn.rollback()
                        return self.send(404, {"error": "Not found"})
                    if not hmac.compare_digest(_etag(task), previous):
                        tag = _etag(task)
                        conn.rollback()
                        return self.send(412, {"error": "Stale version"}, etag=tag)
                    conn.execute("""UPDATE tasks SET status=?, version=version+1
                        WHERE tenant_id=? AND id=?""",
                        (body["status"], actor["tenantId"], record_id))
                    changed = conn.execute("SELECT * FROM tasks WHERE tenant_id=? AND id=?",
                                           (actor["tenantId"], record_id)).fetchone()
                    result, tag = {"data": dict(changed)}, _etag(changed)
                    ts = int(clock())
                    conn.execute("""INSERT INTO receipts
                        (tenant_id,subject_id,request_key_hash,fingerprint,
                         record_id,response_json,response_etag,created_at)
                        VALUES (?,?,?,?,?,?,?,?)""",
                        (*args, fp, record_id, json.dumps(result, separators=(",", ":")), tag, ts))
                    conn.execute("INSERT INTO spent_keys VALUES (?,?,?)", args)
                    conn.execute("""INSERT INTO audit_events
                        (event,tenant_id,subject_id,request_key_hash,created_at)
                        VALUES ('committed',?,?,?,?)""", (*args, ts))
                    conn.commit()
                except BaseException:
                    conn.rollback()
                    raise
            if fault is not None and fault.get("commit_then_503_once"):
                fault["commit_then_503_once"] = False
                return self.send(503, {"error": "Injected response loss after durable commit"})
            return self.send(200, result, etag=tag)

        def do_POST(self):
            return self.send(405, {"error": "Only scoped synthetic PATCH implemented"})

        def do_DELETE(self):
            return self.send(405, {"error": "No deletion in the reference API"})

    return Handler
