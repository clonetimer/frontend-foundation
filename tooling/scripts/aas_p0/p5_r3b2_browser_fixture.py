#!/usr/bin/env python3
"""TEST ONLY. Same-origin static Chromium page + synthetic session ledger.

Privileged cookie provisioning occurs solely over the parent-process stdin/stdout
protocol, never via an HTTP login endpoint, URL parameter or JavaScript.
Not a production identity service, reverse proxy, or Studio endpoint.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
import threading
from contextlib import closing
from http.server import ThreadingHTTPServer
from pathlib import Path

from p5_r3b_scoped_reference import create_fixture
from p5_r3b_session_adapter import SyntheticSessionStore, make_session_handler

ACTOR = {
    "tenantId": "tenant-a", "subjectId": "alice", "role": "writer",
    "sessionEpoch": "11111111-1111-4111-8111-111111111111",
}
OTHER = {
    "tenantId": "tenant-b", "subjectId": "bob", "role": "writer",
    "sessionEpoch": "22222222-2222-4222-8222-222222222222",
}
MODULE = Path(__file__).with_name("p5_capability_contract.mjs")
R3C_MODULE = Path(__file__).with_name("p5_r3c_scoped_journal.mjs")
R3C2_MODULE = Path(__file__).with_name("p5_r3c2_runtime_adapter.mjs")
PAGE = b"<!doctype html><html><head><meta charset='UTF-8'><title>P5 isolated browser contract</title></head><body><main id='p5-browser-contract'>Isolated P5 browser protocol acceptance</main></body></html>"


def main(port):
    with tempfile.TemporaryDirectory(prefix="p5_r3b2_browser_native_") as directory:
        path = str(Path(directory) / "synthetic.sqlite")
        create_fixture(path)
        sessions = SyntheticSessionStore(ttl_seconds=3600)
        alice = sessions.issue(ACTOR)
        current = {"cookie": alice}
        fault = {"commit_then_503_once": True}
        origin = f"http://127.0.0.1:{port}"
        parent = make_session_handler(path, origin, sessions, fault=fault)

        class TestHandler(parent):
            def do_GET(self):
                if self.path in ("/", "/p5_capability_contract.mjs", "/p5_r3c_scoped_journal.mjs", "/p5_r3c2_runtime_adapter.mjs"):
                    if not self._same_host():
                        return
                    raw = (PAGE if self.path == "/" else
                           MODULE.read_bytes() if self.path == "/p5_capability_contract.mjs"
                           else R3C_MODULE.read_bytes() if self.path == "/p5_r3c_scoped_journal.mjs"
                           else R3C2_MODULE.read_bytes())
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(raw)))
                    self.send_header("Content-Type", "text/html; charset=utf-8" if self.path == "/" else "text/javascript; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("X-Content-Type-Options", "nosniff")
                    self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'")
                    self.end_headers()
                    self.wfile.write(raw)
                    return
                super().do_GET()

        server = ThreadingHTTPServer(("127.0.0.1", port), TestHandler)
        stdout_lock = threading.Lock()

        def reply(message):
            with stdout_lock:
                sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
                sys.stdout.flush()

        def stats():
            with closing(sqlite3.connect(path)) as conn:
                row = conn.execute("SELECT status,version FROM tasks WHERE tenant_id='tenant-a' AND id=1").fetchone()
                receipts = conn.execute("SELECT COUNT(*) FROM receipts").fetchone()[0]
                spent = conn.execute("SELECT COUNT(*) FROM spent_keys").fetchone()[0]
                committed = conn.execute("SELECT COUNT(*) FROM audit_events WHERE event='committed'").fetchone()[0]
            return {
                "status": row[0], "version": row[1], "receiptCount": receipts,
                "spentKeys": spent, "committedAudits": committed,
                "injected503Consumed": not fault["commit_then_503_once"]
            }

        def commands():
            for line in sys.stdin:
                action = line.strip()
                try:
                    if action == "ROTATE":
                        current["cookie"] = sessions.rotate(current["cookie"])
                        reply({"type": "rotated", "cookie": current["cookie"]})
                    elif action == "OTHER":
                        current["cookie"] = sessions.issue(OTHER)
                        reply({"type": "other", "cookie": current["cookie"]})
                    elif action == "REVOKE":
                        sessions.revoke(current["cookie"])
                        reply({"type": "revoked"})
                    elif action == "STATS":
                        reply({"type": "stats", "data": stats()})
                    else:
                        reply({"type": "error", "message": "Unknown harness command"})
                except (ValueError, sqlite3.Error) as error:
                    reply({"type": "error", "message": type(error).__name__})
            server.shutdown()

        worker = threading.Thread(target=commands, daemon=True)
        worker.start()
        reply({"type": "ready", "cookie": alice})
        try:
            server.serve_forever(poll_interval=0.1)
        finally:
            server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5497)
    args = parser.parse_args()
    if args.port < 1024 or args.port > 65535:
        parser.error("Port outside allowed development range")
    main(args.port)
