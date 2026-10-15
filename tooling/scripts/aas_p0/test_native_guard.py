"""Standalone synthetic tests for guarding the original AAS DashboardHandler."""
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from native_guard import guard_handler, local_origin, validate_tokens

READER = "r" * 40
WRITER = "w" * 40
ORIGIN = "http://127.0.0.1:5188"


class NativeFixture(BaseHTTPRequestHandler):
    writes = 0

    def log_message(self, *_):
        pass

    def reply(self, code, data):
        raw = json.dumps(data).encode("utf8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self.reply(200, {"source": "NATIVE_AAS_ORIGINAL", "url": self.path})

    def do_POST(self):
        NativeFixture.writes += 1
        self.reply(201, {})

    def do_PUT(self):
        NativeFixture.writes += 1
        self.reply(200, {})

    def do_DELETE(self):
        NativeFixture.writes += 1
        self.reply(200, {})


class NativeGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), guard_handler(NativeFixture, READER, WRITER, ORIGIN))
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def request(self, path, method="GET", token=None, origin=None, data=None):
        headers = {}
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        if origin is not None:
            headers["Origin"] = origin
        req = Request(self.url + path, method=method, headers=headers, data=data)
        try:
            with urlopen(req, timeout=5) as response:
                return response.status, dict(response.headers), response.read()
        except HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def test_01_default_deny_and_wrong_token(self):
        self.assertEqual(self.request("/api/models")[0], 401)
        self.assertEqual(self.request("/api/databases")[0], 401)
        self.assertEqual(self.request("/api/models", token="invalid")[0], 401)
        self.assertIn("WWW-Authenticate", self.request("/api/models")[1])

    def test_02_native_reads_work_with_both_roles(self):
        for token in (READER, WRITER):
            status, headers, content = self.request("/api/models?limit=1", token=token, origin=ORIGIN)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(content)["source"], "NATIVE_AAS_ORIGINAL")
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), ORIGIN)
        self.assertEqual(self.request("/static.js")[0], 200)

    def test_03_native_mutating_bypass_always_blocked(self):
        for method, route in (
            ("POST", "/api/models"), ("PUT", "/api/models/1/status"),
            ("DELETE", "/api/models/1"), ("PATCH", "/api/models/1")
        ):
            self.assertEqual(self.request(route, method, WRITER, data=b"{}")[0], 403)
        self.assertEqual(NativeFixture.writes, 0)

    def test_04_bad_origin_and_preflight(self):
        self.assertEqual(self.request("/api/models", token=READER, origin="http://evil.example")[0], 403)
        self.assertEqual(self.request("/api/models", "OPTIONS", origin=ORIGIN)[0], 204)
        self.assertEqual(self.request("/api/models", "OPTIONS", origin="http://evil.example")[0], 403)
        self.assertEqual(self.request("/api/models", "HEAD")[0], 401)

    def test_05_fail_closed_configuration(self):
        for invalid in (
            "http://0.0.0.0:80", "https://127.0.0.1:80",
            "http://u:p@localhost:80", "http://example.com:80", "http://127.0.0.1:80/a"
        ):
            with self.assertRaises(ValueError):
                local_origin(invalid)
        for reader, writer in (("short", WRITER), (READER, READER)):
            with self.assertRaises(ValueError):
                validate_tokens(reader, writer)


if __name__ == "__main__":
    unittest.main(verbosity=2)
