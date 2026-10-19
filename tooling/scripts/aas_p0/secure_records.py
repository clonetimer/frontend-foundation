#!/usr/bin/env python3
"""EXPERIMENTAL loopback Studio/AAS native SQLite P0 gateway, NOT production auth.

The original AAS HTTP listener stays unauthenticated and must remain isolated.
This module has no model artifact POST/DELETE. Status mutations are disabled
by default, and opt-in writes accept only synthetic p0_case_N models.
"""
from __future__ import annotations
import argparse
import hashlib
import hmac
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from native_idempotency import (
    KEY as IDEMPOTENCY_KEY, verify_prepared, fingerprint, principal_hash,
    matches_receipt,
)

ID_PATH = re.compile(r"/api/records/([1-9][0-9]{0,15})\Z")
RECEIPT_PATH = re.compile(r"/api/mutations/([A-Za-z0-9_-]{16,128})\Z")
FIXTURE = re.compile(r"p0_case_[1-9][0-9]{0,3}\Z")
STATES = frozenset({"draft", "published", "evaluated"})
SORTS = {"id": "id", "name": "model_name", "status": "status", "algorithm": "algorithm"}
FILTERS = {"status": "status", "algorithm": "algorithm"}
SELECT = "SELECT * FROM models"


def model_etag(row):
    """Strong content ETag over the complete native AAS model row."""
    data = json.dumps(dict(row), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return '"' + hashlib.sha256(data.encode("utf-8")).hexdigest() + '"'


def as_record(row):
    return {"id": row["id"], "name": row["model_name"], "status": row["status"],
            "algorithm": row["algorithm"], "experiment_id": row["experiment_id"],
            "_etag": model_etag(row)}


def loopback_origin(text):
    url = urlsplit(text)
    if (url.scheme != "http" or url.hostname not in ("localhost", "127.0.0.1", "::1")
            or not url.port or url.username or url.password or url.path not in ("", "/")
            or url.query or url.fragment):
        raise ValueError("An explicit loopback-only Studio HTTP origin is required")
    return text.rstrip("/")


def make_handler(db_path, studio_origin, read_token, write_token, allow_synthetic_writes=False,
                 enable_native_idempotency=False, fault=None):
    """Build an authenticated local-only test handler without changing AAS files."""
    origin = loopback_origin(studio_origin)
    if (len(read_token) < 32 or len(write_token) < 32
            or hmac.compare_digest(read_token, write_token)):
        raise ValueError("Two distinct nonempty >=32-character tokens are required")
    database = Path(db_path).resolve(strict=True)
    if database.suffix.lower() not in (".db", ".sqlite", ".sqlite3") or not database.is_file():
        raise ValueError("Expected an existing AAS SQLite model database")
    if enable_native_idempotency:
        if not allow_synthetic_writes:
            raise ValueError("Native idempotency requires explicit synthetic write opt-in")
        verify_prepared(database)  # never auto-create a table during gateway startup
    with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as check:
        if not check.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='models'").fetchone():
            raise ValueError("Native models table absent")

    def connect():
        conn = sqlite3.connect(f"file:{database}?mode=rw", uri=True, isolation_level=None, timeout=8)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=8000")
        return conn

    class Handler(BaseHTTPRequestHandler):
        server_version = "StudioAASP0/2"

        def log_message(self, *_):
            pass  # Do not log tokens, request headers or user data.

        def reply(self, code, body, *, etag=None, challenge=False, replay=False):
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if etag:
                self.send_header("ETag", etag)
            if replay:
                self.send_header("Idempotency-Replayed", "true")
            if challenge:
                self.send_header("WWW-Authenticate", 'Bearer realm="Studio AAS P0"')
            if self.headers.get("Origin") == origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET,PATCH,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,If-Match,Idempotency-Key")
                self.send_header("Access-Control-Expose-Headers", "ETag,Idempotency-Replayed")
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(raw)

        def authorize(self, *, write=False):
            incoming = self.headers.get("Origin")
            if incoming and incoming != origin:
                self.reply(403, {"error": "Untrusted Origin"})
                return False
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer ") or not 0 < len(header[7:]) <= 4096:
                self.reply(401, {"error": "Bearer authentication required"}, challenge=True)
                return False
            candidate = header[7:]
            writer = hmac.compare_digest(candidate, write_token)
            reader = hmac.compare_digest(candidate, read_token)
            if not writer and not reader:
                self.reply(401, {"error": "Invalid token"}, challenge=True)
                return False
            if write and not writer:
                self.reply(403, {"error": "Write role required"})
                return False
            if write and not allow_synthetic_writes:
                self.reply(403, {"error": "Synthetic writes disabled"})
                return False
            return True

        def do_OPTIONS(self):
            if self.headers.get("Origin") != origin:
                return self.reply(403, {"error": "Untrusted preflight origin"})
            return self.reply(204, {})

        def do_GET(self):
            if not self.authorize():
                return
            url = urlsplit(self.path)
            match = ID_PATH.fullmatch(url.path)
            receipt_match = RECEIPT_PATH.fullmatch(url.path) if enable_native_idempotency else None
            if (url.path != "/api/records" and not match and not receipt_match) or (url.query and (match or receipt_match)):
                return self.reply(404, {"error": "Not found"})
            if receipt_match and not self.authorize(write=True):
                return
            try:
                with closing(connect()) as conn, conn:
                    conn.execute("BEGIN")
                    if receipt_match:
                        receipt = conn.execute("""SELECT record_id,response_json FROM native_mutation_receipts
                            WHERE request_key=? AND principal_hash=?""",
                            (receipt_match.group(1), principal_hash(write_token))).fetchone()
                        if not receipt:
                            return self.reply(404, {"status": "not_found"})
                        return self.reply(200, {"status": "committed",
                            "recordId": receipt["record_id"],
                            "response": json.loads(receipt["response_json"])})
                    if match:
                        row = conn.execute(SELECT + " WHERE id=?", (int(match.group(1)),)).fetchone()
                        if not row:
                            return self.reply(404, {"error": "Not found"})
                        return self.reply(200, {"data": as_record(row)}, etag=model_etag(row))
                    options = parse_qs(url.query, keep_blank_values=True)
                    if (set(options) - {"page", "pageSize", "search", "filterField", "filter", "sort", "order"}
                            or any(len(v) != 1 for v in options.values())):
                        raise ValueError("Unknown/duplicate list option")
                    def one(key, default):
                        return options.get(key, [default])[0]
                    page, size = int(one("page", "1")), int(one("pageSize", "5"))
                    term, field, value = one("search", "").strip(), one("filterField", ""), one("filter", "")
                    sort, direction = one("sort", "id"), one("order", "asc")
                    if (not 1 <= page <= 100000 or not 1 <= size <= 20 or len(term) > 100
                            or len(value) > 100 or sort not in SORTS or direction not in ("asc", "desc")
                            or field not in ("", *FILTERS)):
                        raise ValueError("Invalid paging/filter/sort")
                    predicates, parameters = [], []
                    if term:
                        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                        predicates.append("model_name LIKE ? ESCAPE '\\'")
                        parameters.append("%" + escaped + "%")
                    if value:
                        if not field:
                            raise ValueError("filterField required")
                        predicates.append(FILTERS[field] + "=?")
                        parameters.append(value)
                    where = " WHERE " + " AND ".join(predicates) if predicates else ""
                    total = conn.execute("SELECT COUNT(*) FROM models" + where, parameters).fetchone()[0]
                    order = "DESC" if direction == "desc" else "ASC"
                    rows = conn.execute(
                        SELECT + where + f" ORDER BY {SORTS[sort]} COLLATE NOCASE {order}, id {order} LIMIT ? OFFSET ?",
                        (*parameters, size, (page - 1) * size)).fetchall()
                    return self.reply(200, {"data": {"items": [as_record(row) for row in rows], "total": total}})
            except (ValueError, OverflowError, sqlite3.DataError):
                return self.reply(400, {"error": "Invalid list parameters"})
            except sqlite3.Error:
                return self.reply(503, {"error": "Native registry temporarily unavailable"})

        def do_PATCH(self):
            if not self.authorize(write=True):
                return
            url = urlsplit(self.path)
            match = ID_PATH.fullmatch(url.path)
            if not match or url.query:
                return self.reply(404, {"error": "Not found"})
            token = self.headers.get("If-Match", "")
            request_key = self.headers.get("Idempotency-Key", "")
            if enable_native_idempotency and not IDEMPOTENCY_KEY.fullmatch(request_key):
                return self.reply(428, {"error": "Idempotency-Key required for native writes"})
            if not enable_native_idempotency and request_key:
                return self.reply(409, {"error": "Native idempotency is not enabled"})
            if not re.fullmatch(r'"[0-9a-f]{64}"', token):
                return self.reply(428, {"error": "Strong If-Match is required"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.reply(415, {"error": "JSON body required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 2 <= length <= 2048:
                    raise ValueError("Invalid payload length")
                raw_body = self.rfile.read(length)
                payload = json.loads(raw_body)
                if not isinstance(payload, dict) or set(payload) != {"status"} or payload["status"] not in STATES:
                    return self.reply(422, {"error": "Only status enum updates are supported"})
                with closing(connect()) as conn, conn:
                    conn.execute("BEGIN IMMEDIATE")
                    key = int(match.group(1))
                    request_fingerprint = fingerprint("PATCH", url.path, token, raw_body) if enable_native_idempotency else None
                    if enable_native_idempotency:
                        receipt = conn.execute("""SELECT * FROM native_mutation_receipts
                            WHERE request_key=?""", (request_key,)).fetchone()
                        if receipt:
                            if not matches_receipt(receipt, write_token, request_fingerprint):
                                return self.reply(409, {"error": "Idempotency key reused for different request"})
                            return self.reply(200, json.loads(receipt["response_json"]),
                                              etag=receipt["response_etag"], replay=True)
                    row = conn.execute(SELECT + " WHERE id=?", (key,)).fetchone()
                    if not row:
                        return self.reply(404, {"error": "Not found"})
                    if not FIXTURE.fullmatch(str(row["experiment_id"])):
                        return self.reply(403, {"error": "Only synthetic p0_case models can be changed"})
                    current = model_etag(row)
                    if not hmac.compare_digest(current, token):
                        return self.reply(412, {"error": "Stale model selection"}, etag=current)
                    if payload["status"] == "evaluated":
                        conn.execute(
                            "UPDATE models SET status=?,last_evaluated_at=?,evaluation_count=evaluation_count+1 WHERE id=?",
                            (payload["status"], datetime.now(timezone.utc).isoformat(), key))
                    else:
                        conn.execute("UPDATE models SET status=? WHERE id=?", (payload["status"], key))
                    revised = conn.execute(SELECT + " WHERE id=?", (key,)).fetchone()
                    response = {"data": as_record(revised)}
                    updated_etag = model_etag(revised)
                    if enable_native_idempotency:
                        conn.execute("""INSERT INTO native_mutation_receipts
                            (request_key,principal_hash,fingerprint,record_id,response_json,response_etag,created_at)
                            VALUES (?,?,?,?,?,?,?)""",
                            (request_key, principal_hash(write_token), request_fingerprint, key,
                             json.dumps(response, ensure_ascii=False), updated_etag,
                             datetime.now(timezone.utc).isoformat()))
                    conn.execute("COMMIT")
                    if enable_native_idempotency and fault is not None and fault.get("commit_then_503_once"):
                        fault["commit_then_503_once"] = False
                        return self.reply(503, {"error": "Synthetic fault: committed but response lost"})
                    return self.reply(200, response, etag=updated_etag)
            except (ValueError, TypeError, json.JSONDecodeError):
                return self.reply(400, {"error": "Invalid status update"})
            except sqlite3.Error:
                return self.reply(503, {"error": "Registry write uncertain; inspect before retrying"})

        def do_POST(self):
            return self.reply(405, {"error": "Native AAS model artifact validation required; unsupported"})

        def do_DELETE(self):
            return self.reply(405, {"error": "Native AAS deletion affects model files; unsupported"})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--port", type=int, default=8792)
    parser.add_argument("--read-token-env", default="STUDIO_AAS_P0_READ_TOKEN")
    parser.add_argument("--write-token-env", default="STUDIO_AAS_P0_WRITE_TOKEN")
    parser.add_argument("--allow-synthetic-status-writes", action="store_true")
    parser.add_argument("--enable-native-idempotency", action="store_true",
                        help="Opt-in. Requires pre-migrated synthetic AAS fixture DB")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be 1024..65535")
    handler = make_handler(args.db, args.origin, os.environ.get(args.read_token_env, ""),
                           os.environ.get(args.write_token_env, ""), args.allow_synthetic_status_writes,
                           enable_native_idempotency=args.enable_native_idempotency)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
