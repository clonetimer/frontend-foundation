#!/usr/bin/env python3
"""LOCAL P0 TEST HARNESS, NOT AN AUTHENTICATED PRODUCTION GATEWAY.

Converts Studio /api/records to the user AAS model-registry HTTP protocol.
All listeners and upstreams are loopback; writes are opt-in and confined
to synthetic IDs created through this process. No authorization, audit, CSRF,
ETag/CAS, or true native pagination. Never deploy to an external interface.
"""
from __future__ import annotations
import argparse
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

RECORD_ID = re.compile(r"/api/records/([1-9]\d{0,15})\Z")
FIXTURE = re.compile(r"p0_case_[1-9]\d{0,2}\Z")
STATES = {"draft", "published", "evaluated"}
SORTS = {"id", "name", "status", "algorithm"}

def loopback(raw):
    u = urlsplit(raw)
    if u.scheme != "http" or u.hostname not in ("localhost", "127.0.0.1", "::1") or not u.port or u.username or u.password or u.path not in ("", "/") or u.query or u.fragment:
        raise ValueError("P0 endpoints must be HTTP loopback origins without credentials")
    return raw.rstrip("/")

def make_handler(aas, origin, allow_writes=False):
    native = loopback(aas)
    trusted_origin = loopback(origin)
    created = set()
    lock = threading.RLock()

    class Bridge(BaseHTTPRequestHandler):
        server_version = "Studio-AAS-P0/1"
        def log_message(self, *_):
            pass

        def respond(self, code, payload):
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if self.headers.get("Origin") == trusted_origin:
                self.send_header("Access-Control-Allow-Origin", trusted_origin)
                self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(data)

        def native_call(self, method, route, payload=None):
            body = json.dumps(payload).encode() if payload is not None else None
            request = Request(native + route, data=body, method=method, headers={"Content-Type": "application/json"})
            try:
                with urlopen(request, timeout=8) as response:
                    code, raw, mime = response.status, response.read(524288), response.headers.get("Content-Type", "")
            except HTTPError as error:
                code, raw, mime = error.code, error.read(524288), error.headers.get("Content-Type", "")
            if "json" not in mime:
                raise ValueError("Native AAS must respond with JSON")
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise ValueError("Malformed native AAS JSON")
            return code, parsed

        def body(self):
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise ValueError("JSON content type required")
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 4096:
                raise ValueError("Body size outside 2..4096 bytes")
            result = json.loads(self.rfile.read(length))
            if not isinstance(result, dict):
                raise ValueError("Object JSON required")
            return result

        def dispatch(self, method):
            url = urlsplit(self.path)
            match = RECORD_ID.fullmatch(url.path)
            if len(self.path) > 2048 or (url.path != "/api/records" and not match):
                return self.respond(404, {"error": "Not found"})
            if method != "GET" and not allow_writes:
                return self.respond(403, {"error": "Synthetic writes disabled by default"})
            if method != "GET" and self.headers.get("Origin") not in (None, trusted_origin):
                return self.respond(403, {"error": "Untrusted Origin"})
            try:
                if method == "GET" and not match:
                    query = parse_qs(url.query, keep_blank_values=True)
                    if set(query) - {"page", "pageSize", "search", "filterField", "filter", "sort", "order"}:
                        raise ValueError("Unknown list option")
                    def option(key, default):
                        values = query.get(key, [default])
                        if len(values) != 1:
                            raise ValueError("Duplicated list option")
                        return values[0]
                    page = int(option("page", "1"))
                    size = int(option("pageSize", "5"))
                    search = option("search", "").strip().casefold()
                    filter_field = option("filterField", "")
                    filter_value = option("filter", "")
                    sort = option("sort", "id")
                    order = option("order", "asc")
                    if not 1 <= page <= 100000 or not 1 <= size <= 20 or len(search) > 100 or len(filter_value) > 100 or sort not in SORTS or order not in ("asc", "desc") or filter_field not in ("", "status", "algorithm"):
                        raise ValueError("Invalid pagination/filter/sort")
                    code, data = self.native_call("GET", "/api/models?limit=500")
                    if code != 200:
                        return self.respond(code, {"error": "Native model list unavailable"})
                    models = data.get("models")
                    if not isinstance(models, list) or not isinstance(data.get("total"), int):
                        return self.respond(502, {"error": "Malformed native AAS model list"})
                    # AAS total means length of its LIMIT 500 result, not real total.
                    if len(models) >= 500 or data["total"] != len(models):
                        return self.respond(409, {"error": "Native AAS 500-row cap or inconsistent list; pagination cannot be certified"})
                    items = [{"id": m["id"], "name": m["model_name"], "status": m["status"], "algorithm": m["algorithm"], "experiment_id": m["experiment_id"]} for m in models]
                    items = [m for m in items if (not search or search in str(m["name"]).casefold()) and (not filter_value or (filter_field in ("status", "algorithm") and str(m[filter_field]) == filter_value))]
                    items.sort(key=lambda m: m["id"] if sort == "id" else str(m[sort]).casefold(), reverse=order == "desc")
                    offset = (page - 1) * size
                    return self.respond(200, {"data": {"items": items[offset:offset+size], "total": len(items)}})
                if method == "GET" and match:
                    code, model = self.native_call("GET", "/api/models/" + match.group(1))
                    if code != 200:
                        return self.respond(code, {"error": model.get("error", "Not found")})
                    return self.respond(200, {"data": {"id": model["id"], "name": model["model_name"], "status": model["status"], "algorithm": model["algorithm"], "experiment_id": model["experiment_id"]}})
                if method == "POST" and not match:
                    payload = self.body()
                    experiment, name = payload.get("experiment_id"), payload.get("name")
                    if set(payload) != {"experiment_id", "name"} or not isinstance(experiment, str) or not FIXTURE.fullmatch(experiment) or not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
                        return self.respond(422, {"error": "Only validated p0_case_N synthetic models may be created"})
                    with lock:
                        code, published = self.native_call("POST", "/api/models", {
                            "experiment_id": experiment, "model_name": name.strip(), "algorithm": "dummy_detector",
                            "dataset": "synthetic", "table_name": "p0_measurements",
                            "file_path": "models/model_" + experiment, "metrics": {}, "config": {}})
                        if code != 200 or published.get("status") != "success":
                            return self.respond(code if code != 200 else 502, {"error": "Native fixture publication rejected"})
                        code, listing = self.native_call("GET", "/api/models?limit=500")
                        matches = [m for m in listing.get("models", []) if m.get("experiment_id") == experiment and m.get("model_name") == name.strip()] if code == 200 else []
                        if len(matches) != 1:
                            return self.respond(409, {"error": "Publication result uncertain; inspect native DB before retry"})
                        identity = int(matches[0]["id"])
                        created.add(identity)
                        return self.respond(201, {"data": {"id": identity, "name": name.strip()}})
                if match and method in ("PATCH", "DELETE"):
                    identity = int(match.group(1))
                    with lock:
                        if identity not in created:
                            return self.respond(403, {"error": "Only models created in this bridge process may be mutated"})
                        code, model = self.native_call("GET", "/api/models/" + str(identity))
                        if code != 200 or not FIXTURE.fullmatch(str(model.get("experiment_id", ""))):
                            return self.respond(403, {"error": "Synthetic model identity mismatch"})
                        if method == "PATCH":
                            body = self.body()
                            if set(body) != {"status"} or body["status"] not in STATES:
                                return self.respond(422, {"error": "AAS only supports status enum updates"})
                            code, data = self.native_call("PUT", "/api/models/" + str(identity) + "/status", body)
                        else:
                            code, data = self.native_call("DELETE", "/api/models/" + str(identity))
                            if code == 200:
                                created.discard(identity)
                        return self.respond(code, {"data": data} if code == 200 else {"error": data.get("error", "Native AAS error")})
                return self.respond(405, {"error": "Unsupported native model action"})
            except (ValueError, KeyError, TypeError, json.JSONDecodeError):
                return self.respond(400, {"error": "Invalid Studio request or AAS response"})
            except (URLError, TimeoutError, OSError):
                return self.respond(503, {"error": "AAS unavailable; write outcome may be uncertain"})

        def do_GET(self): self.dispatch("GET")
        def do_POST(self): self.dispatch("POST")
        def do_PATCH(self): self.dispatch("PATCH")
        def do_DELETE(self): self.dispatch("DELETE")
        def do_OPTIONS(self):
            return self.respond(200, {}) if self.headers.get("Origin") == trusted_origin else self.respond(403, {"error": "Untrusted Origin"})
    return Bridge

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument("--allow-synthetic-writes", action="store_true")
    options = parser.parse_args()
    loopback(options.upstream)
    loopback(options.origin)
    if not 1024 <= options.port <= 65535:
        parser.error("Port must be 1024..65535")
    srv = ThreadingHTTPServer(("127.0.0.1", options.port), make_handler(options.upstream, options.origin, options.allow_synthetic_writes))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()

if __name__ == "__main__":
    main()
