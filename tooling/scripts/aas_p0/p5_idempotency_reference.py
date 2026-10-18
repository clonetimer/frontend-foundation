#!/usr/bin/env python3
"""P5 synthetic-only SQLite reference contract, NOT the AAS native write gateway.

One synthetic fixture SQLite DB owns BOTH record state and replay receipts.
This deliberately does not migrate or write any existing AAS database.
It is an executable backend contract for future opt-in provider adapters.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
from contextlib import closing
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

from secure_records import loopback_origin

MARKER = "frontend-foundation-p5-synthetic-only-v1"
ROW = re.compile(r"/api/records/([1-9][0-9]{0,9})\Z")
KEY = re.compile(r"[A-Za-z0-9_-]{16,128}\Z")
STATES = frozenset(("draft", "published", "evaluated"))


def initialize_fixture(db_path):
    """Create a NEW synthetic DB only. Refuse to open or migrate existing files."""
    target = Path(db_path)
    if target.exists():
        raise ValueError("P5 fixture must use a new DB path, never an existing AAS DB")
    target.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(target)) as conn, conn:
        conn.execute("CREATE TABLE p5_marker (value TEXT NOT NULL)")
        conn.execute("INSERT INTO p5_marker VALUES (?)", (MARKER,))
        conn.execute("""CREATE TABLE records (
            id INTEGER PRIMARY KEY, status TEXT NOT NULL,
            version INTEGER NOT NULL CHECK (version >= 1))""")
        conn.execute("""CREATE TABLE mutation_receipts (
            request_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
            record_id INTEGER NOT NULL, response_json TEXT NOT NULL,
            response_etag TEXT NOT NULL)""")
        conn.execute("INSERT INTO records VALUES (1, 'draft', 1)")
        conn.execute("INSERT INTO records VALUES (2, 'draft', 1)")
    return target


def etag(record):
    raw = f"{record['id']}:{record['status']}:{record['version']}"
    return '"' + hashlib.sha256(raw.encode()).hexdigest() + '"'


def make_handler(db_path, studio_origin, write_token, fault=None):
    """Create loopback-only test gateway; 'fault' is an in-process test hook."""
    origin = loopback_origin(studio_origin)
    if len(write_token) < 32:
        raise ValueError("Test writer token must be >= 32 characters")
    database = Path(db_path).resolve(strict=True)
    with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as conn:
        marker = conn.execute("SELECT value FROM p5_marker").fetchone()
        if marker != (MARKER,):
            raise ValueError("Refusing to serve a non-P5 or native AAS database")

    def connect():
        conn = sqlite3.connect(f"file:{database}?mode=rw", uri=True,
                               isolation_level=None, timeout=8)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=8000")
        return conn

    class Handler(BaseHTTPRequestHandler):
        server_version = "StudioP5Synthetic/1"

        def log_message(self, *_):
            pass  # Never log credentials, payloads, or record content.

        def reply(self, status, value, *, tag=None, replay=False):
            raw = json.dumps(value, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            if tag:
                self.send_header("ETag", tag)
            if replay:
                self.send_header("Idempotency-Replayed", "true")
            self.end_headers()
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The commit/receipt were already durable.

        def authorize(self):
            if self.headers.get("Origin") != origin:
                self.reply(403, {"error": "Untrusted origin"})
                return False
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Bearer ") or not hmac.compare_digest(
                    auth[7:], write_token):
                self.reply(401, {"error": "Writer authentication required"})
                return False
            return True

        def do_OPTIONS(self):
            if self.headers.get("Origin") != origin:
                return self.reply(403, {"error": "Untrusted origin"})
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET,PATCH,OPTIONS")
            self.send_header("Access-Control-Allow-Headers",
                             "Authorization,Content-Type,If-Match,Idempotency-Key")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            if not self.authorize():
                return
            url = urlsplit(self.path)
            if url.query or url.fragment:
                return self.reply(404, {"error": "Not found"})
            row_match = ROW.fullmatch(url.path)
            receipt_key = url.path.removeprefix("/api/mutations/")
            if not row_match and (not url.path.startswith("/api/mutations/")
                                  or not KEY.fullmatch(receipt_key)):
                return self.reply(404, {"error": "Not found"})
            try:
                with closing(connect()) as conn:
                    if row_match:
                        row = conn.execute("SELECT * FROM records WHERE id=?",
                                           (int(row_match.group(1)),)).fetchone()
                        if not row:
                            return self.reply(404, {"error": "Not found"})
                        return self.reply(200, {"data": dict(row)}, tag=etag(row))
                    receipt = conn.execute(
                        "SELECT record_id,response_json FROM mutation_receipts WHERE request_key=?",
                        (receipt_key,)).fetchone()
                    if not receipt:
                        return self.reply(404, {"status": "not_found"})
                    return self.reply(200, {"status": "committed",
                                            "recordId": receipt["record_id"],
                                            "response": json.loads(receipt["response_json"])})
            except sqlite3.Error:
                return self.reply(503, {"error": "Synthetic fixture unavailable"})

        def do_PATCH(self):
            if not self.authorize():
                return
            url = urlsplit(self.path)
            match = ROW.fullmatch(url.path) if not url.query else None
            if not match:
                return self.reply(404, {"error": "Not found"})
            request_key = self.headers.get("Idempotency-Key", "")
            prior_etag = self.headers.get("If-Match", "")
            if not KEY.fullmatch(request_key) or not re.fullmatch(r'"[0-9a-f]{64}"', prior_etag):
                return self.reply(428, {"error": "Strong If-Match and Idempotency-Key required"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.reply(415, {"error": "JSON body required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 2 <= length <= 512:
                    return self.reply(413, {"error": "Invalid JSON size"})
                raw = self.rfile.read(length)
                data = json.loads(raw)
                if not isinstance(data, dict) or set(data) != {"status"} or data["status"] not in STATES:
                    return self.reply(422, {"error": "Invalid synthetic status"})
            except (ValueError, TypeError, json.JSONDecodeError):
                return self.reply(400, {"error": "Invalid JSON"})
            record_id = int(match.group(1))
            # Bind request key to exact method+path+If-Match+body. The key cannot
            # be reused for another record, payload, or CAS version.
            fingerprint = hashlib.sha256(
                b"PATCH\n" + url.path.encode() + b"\n" +
                prior_etag.encode() + b"\n" + raw).hexdigest()
            try:
                with closing(connect()) as conn:
                    conn.execute("BEGIN IMMEDIATE")
                    receipt = conn.execute(
                        "SELECT * FROM mutation_receipts WHERE request_key=?",
                        (request_key,)).fetchone()
                    if receipt:
                        if not hmac.compare_digest(receipt["fingerprint"], fingerprint):
                            conn.rollback()
                            return self.reply(409, {"error": "Idempotency key reused with different request"})
                        response = json.loads(receipt["response_json"])
                        tag = receipt["response_etag"]
                        conn.rollback()
                        return self.reply(200, response, tag=tag, replay=True)
                    row = conn.execute("SELECT * FROM records WHERE id=?",
                                       (record_id,)).fetchone()
                    if not row:
                        conn.rollback()
                        return self.reply(404, {"error": "Not found"})
                    if not hmac.compare_digest(etag(row), prior_etag):
                        current = etag(row)
                        conn.rollback()
                        return self.reply(412, {"error": "Stale If-Match"}, tag=current)
                    conn.execute("UPDATE records SET status=?,version=version+1 WHERE id=?",
                                 (data["status"], record_id))
                    updated = conn.execute("SELECT * FROM records WHERE id=?",
                                           (record_id,)).fetchone()
                    result = {"data": dict(updated)}
                    revised_tag = etag(updated)
                    conn.execute("""INSERT INTO mutation_receipts
                        (request_key,fingerprint,record_id,response_json,response_etag)
                        VALUES (?,?,?,?,?)""",
                        (request_key, fingerprint, record_id,
                         json.dumps(result, separators=(",", ":")), revised_tag))
                    conn.commit()  # record transition + receipt are in ONE SQLite transaction
                if fault is not None and fault.get("commit_then_503_once"):
                    fault["commit_then_503_once"] = False
                    return self.reply(503, {"error": "Simulated gateway lost success after commit"})
                return self.reply(200, result, tag=revised_tag)
            except sqlite3.Error:
                return self.reply(503, {"error": "Synthetic write state uncertain"})

        def do_DELETE(self):
            return self.reply(405, {"error": "Synthetic DELETE not supported"})

        def do_POST(self):
            return self.reply(405, {"error": "Synthetic POST not supported"})
    return Handler
