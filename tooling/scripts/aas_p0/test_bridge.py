"""Synthetic native-AAS HTTP service; checks that the PUBLIC bridge is only a test harness."""
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from bridge import make_handler, loopback

class AASFixture(BaseHTTPRequestHandler):
    lock = threading.Lock()
    rows = {}
    seq = 0
    saturate = False
    def log_message(self, *_): pass
    def reply(self, code, data):
        blob = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)
    def body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
    def do_GET(self):
        with self.lock:
            path = urlsplit(self.path).path
            if path == "/api/models":
                if self.saturate:
                    models = [{"id": i, "model_name": "R-" + str(i), "status": "draft", "algorithm": "dummy_detector", "experiment_id": "p0_case_1"} for i in range(500)]
                else:
                    models = list(self.rows.values())
                return self.reply(200, {"models": models, "total": len(models)})
            if path.startswith("/api/models/"):
                row = self.rows.get(int(path.split("/")[-1]))
                return self.reply(200, row) if row else self.reply(404, {"error": "not found"})
        self.reply(404, {"error": "unknown route"})
    def do_POST(self):
        payload = self.body()
        with self.lock:
            type(self).seq += 1
            ident = self.seq
            self.rows[ident] = {"id": ident, "model_name": payload["model_name"],
                                "experiment_id": payload["experiment_id"], "algorithm": payload["algorithm"], "status": "published"}
        self.reply(200, {"status": "success"})
    def do_PUT(self):
        payload = self.body()
        ident = int(self.path.split("/")[3])
        with self.lock:
            if ident not in self.rows:
                return self.reply(404, {"error": "not found"})
            self.rows[ident]["status"] = payload["status"]
        self.reply(200, {"status": "success"})
    def do_DELETE(self):
        ident = int(self.path.split("/")[3])
        with self.lock:
            item = self.rows.pop(ident, None)
        self.reply(200 if item else 404, {"status": "success"} if item else {"error": "not found"})

class StudioAASBridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.native = ThreadingHTTPServer(("127.0.0.1", 0), AASFixture)
        cls.native_origin = "http://127.0.0.1:" + str(cls.native.server_port)
        cls.origin = "http://127.0.0.1:5188"
        cls.bridge = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.native_origin, cls.origin, True))
        cls.url = "http://127.0.0.1:" + str(cls.bridge.server_port)
        for server in (cls.native, cls.bridge):
            threading.Thread(target=server.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        for server in (cls.bridge, cls.native):
            server.shutdown()
            server.server_close()
    def request(self, verb, path, data=None, headers=None):
        payload = json.dumps(data).encode() if data is not None else None
        h = {"Content-Type": "application/json", "Origin": self.origin}
        if headers:
            h.update(headers)
        try:
            with urlopen(Request(self.url + path, method=verb, data=payload, headers=h), timeout=5) as response:
                return response.status, json.load(response), response.headers
        except HTTPError as error:
            return error.code, json.load(error), error.headers
    def test_01_validation_security_and_loopback(self):
        self.assertEqual(self.request("GET", "/api/records")[1]["data"]["total"], 0)
        for query in ["page=0", "pageSize=21", "sort=invalid", "order=bad", "unknown=y", "page=1&page=2"]:
            self.assertEqual(self.request("GET", "/api/records?" + query)[0], 400, query)
        self.assertEqual(self.request("GET", "/api/nope")[0], 404)
        self.assertEqual(self.request("POST", "/api/records", {"experiment_id": "../escape", "name": "bad"})[0], 422)
        self.assertEqual(self.request("POST", "/api/records", {"experiment_id": "p0_case_1", "name": "bad", "path": "/etc"})[0], 422)
        self.assertEqual(self.request("DELETE", "/api/records/1")[0], 403)
        self.assertEqual(self.request("OPTIONS", "/api/records", headers={"Origin": "http://invalid.example"})[0], 403)
        for invalid in ["http://0.0.0.0:8000", "https://127.0.0.1:8000/", "http://example.com:1234/",
                        "http://user:pass@localhost:1234/", "http://localhost:1234/untrusted"]:
            with self.assertRaises(ValueError):
                loopback(invalid)
    def test_02_crud_and_real_native_roundtrip(self):
        status, created, _ = self.request("POST", "/api/records", {"experiment_id": "p0_case_2", "name": "Item A"})
        self.assertEqual(status, 201)
        identity = created["data"]["id"]
        self.assertEqual(self.request("POST", "/api/records", {"experiment_id": "p0_case_3", "name": "Item B"})[0], 201)
        self.assertEqual(self.request("POST", "/api/records", {"experiment_id": "p0_case_4", "name": "Item C"})[0], 201)
        data = self.request("GET", "/api/records?page=2&pageSize=2&sort=name&order=asc")[1]["data"]
        self.assertEqual((data["total"], len(data["items"])), (3, 1))
        data = self.request("GET", "/api/records?search=Item%20A")[1]["data"]
        self.assertEqual((data["total"], data["items"][0]["id"]), (1, identity))
        self.assertEqual(self.request("GET", "/api/records?filterField=status&filter=published")[1]["data"]["total"], 3)
        self.assertEqual(self.request("GET", "/api/records/" + str(identity))[1]["data"]["name"], "Item A")
        self.assertEqual(self.request("PATCH", "/api/records/" + str(identity), {"name": "forbidden"})[0], 422)
        self.assertEqual(self.request("PATCH", "/api/records/" + str(identity), {"status": "draft"})[0], 200)
        self.assertEqual(AASFixture.rows[identity]["status"], "draft")
        self.assertEqual(self.request("PATCH", "/api/records/" + str(identity), {"status": "other"})[0], 422)
        self.assertEqual(self.request("DELETE", "/api/records/" + str(identity))[0], 200)
        self.assertNotIn(identity, AASFixture.rows)
        self.assertEqual(self.request("DELETE", "/api/records/" + str(identity))[0], 403)
    def test_03_refuse_truncated_aas_page(self):
        AASFixture.saturate = True
        try:
            code, data, _ = self.request("GET", "/api/records?page=1&pageSize=10")
            self.assertEqual(code, 409)
            self.assertIn("500", data["error"])
        finally:
            AASFixture.saturate = False
    def test_04_reject_untrusted_origin(self):
        self.assertEqual(self.request("PATCH", "/api/records/3", {"status": "draft"}, {"Origin": "http://evil.example"})[0], 403)
    def test_05_default_read_only(self):
        safe = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.native_origin, self.origin))
        threading.Thread(target=safe.serve_forever, daemon=True).start()
        try:
            with self.assertRaises(HTTPError) as error:
                urlopen(Request("http://127.0.0.1:" + str(safe.server_port) + "/api/records", method="POST",
                                data=b"{}", headers={"Content-Type": "application/json"}), timeout=5)
            self.assertEqual(error.exception.code, 403)
        finally:
            safe.shutdown()
            safe.server_close()

if __name__ == "__main__":
    unittest.main(verbosity=2)
