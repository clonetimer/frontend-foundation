#!/usr/bin/env python3
"""Optional AAS-native HTTP API guard for an isolated P0 trial.

Protects the original AAS listener: API reads require Bearer credentials and
ALL native API mutations are denied. The separate secure_records gateway owns
conditional synthetic-only writes. NOT a production replacement or UX signoff.
"""
from __future__ import annotations

import argparse
import hmac
import importlib
import json
import os
import sys
from http.server import ThreadingHTTPServer
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit


def validate_tokens(reader, writer):
    if not isinstance(reader, str) or not isinstance(writer, str) or len(reader) < 32 or len(writer) < 32 or hmac.compare_digest(reader, writer):
        raise ValueError("Require two distinct strong reader/writer tokens (>=32 chars)")


def local_origin(value):
    u = urlsplit(value)
    if u.scheme != "http" or u.hostname not in ("localhost", "127.0.0.1", "::1") or not u.port or u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise ValueError("Origin must be a plain loopback HTTP origin")
    return value.rstrip("/")


def guard_handler(native_handler, reader, writer, studio_origin):
    validate_tokens(reader, writer)
    origin = local_origin(studio_origin)

    class NativeAASGuard(native_handler):
        """AAS-compatible request interceptor, without copying original code."""

        def _api_path(self):
            path = urlsplit(self.path).path
            return path == "/api" or path.startswith("/api/")

        def _reply(self, code, reason, auth=False):
            raw = json.dumps({"error": reason}).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            if auth:
                self.send_header("WWW-Authenticate", 'Bearer realm="AAS P0 Native Read-Only"')
            self.end_headers()
            self.wfile.write(raw)

        def end_headers(self):
            if self._api_path() and self.headers.get("Origin") == origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,If-Match")
                self.send_header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS")
                self.send_header("Vary", "Origin")
            super().end_headers()

        def _allow_read(self):
            # The dedicated launcher also binds only to 127.0.0.1.
            try:
                local_client = ip_address(self.client_address[0]).is_loopback
            except ValueError:
                local_client = False
            if not local_client:
                self._reply(403, "Loopback clients only")
                return False
            sent_origin = self.headers.get("Origin")
            if sent_origin and sent_origin != origin:
                self._reply(403, "Untrusted Origin")
                return False
            token = self.headers.get("Authorization", "")
            if not token.startswith("Bearer ") or len(token) > 4103:
                self._reply(401, "Bearer token required", auth=True)
                return False
            candidate = token[7:]
            if not (hmac.compare_digest(candidate, reader) or hmac.compare_digest(candidate, writer)):
                self._reply(401, "Bearer token invalid", auth=True)
                return False
            return True

        def do_GET(self):
            if self._api_path() and not self._allow_read():
                return
            return super().do_GET()

        def do_HEAD(self):
            if self._api_path() and not self._allow_read():
                return
            return super().do_HEAD()

        def do_OPTIONS(self):
            if not self._api_path():
                return self._reply(404, "Unknown path")
            if self.headers.get("Origin") != origin:
                return self._reply(403, "Untrusted Origin")
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):
            return self._reply(403, "Native AAS API writes blocked in P0 trial")

        def do_PUT(self):
            return self._reply(403, "Native AAS API writes blocked in P0 trial")

        def do_PATCH(self):
            return self._reply(403, "Native AAS API writes blocked in P0 trial")

        def do_DELETE(self):
            return self._reply(403, "Native AAS API writes blocked in P0 trial")

    return NativeAASGuard


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aas-root", required=True, help="Separate local AAS checkout; never upload private backend")
    parser.add_argument("--origin", default="http://127.0.0.1:5188")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be 1024..65535")
    root = Path(args.aas_root).resolve(strict=True)
    if not (root / "scripts" / "visualization_server.py").is_file():
        parser.error("Expected AAS/scripts/visualization_server.py")
    reader = os.environ.get("STUDIO_AAS_P0_READ_TOKEN", "")
    writer = os.environ.get("STUDIO_AAS_P0_WRITE_TOKEN", "")
    validate_tokens(reader, writer)
    os.chdir(root)
    sys.path.insert(0, str(root))
    native = importlib.import_module("scripts.visualization_server")
    wrapped = guard_handler(native.DashboardHandler, reader, writer, args.origin)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), wrapped)
    print(f"Protected AAS P0 API (all writes disabled): http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
