"""Loopback-only HTTP demo. Start with: python app.py --port 8766"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from core import (
    ValidationError, MAX_UPLOAD_BYTES, data_path, dataset_info,
    export_csv, import_bytes, list_datasets, query_dataset,
)

HERE = Path(__file__).resolve().parent
ID_ROUTE = re.compile(r"^/api/datasets/([a-f0-9]{32})(?:/(query|export|download))?$")


def make_server(port=8766, data_dir=None):
    base = Path(data_dir) if data_dir is not None else HERE / "data"

    class Handler(BaseHTTPRequestHandler):
        server_version = "FFRequirementExperiment/0.1"

        def _headers(self, status, content_type, size=None, extra=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
            if size is not None:
                self.send_header("Content-Length", str(size))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()

        def _respond(self, data, status=200, content_type="application/json; charset=utf-8", extra=None):
            payload = json.dumps(data, ensure_ascii=False).encode("utf-8") if isinstance(data, (dict, list)) else data
            self._headers(status, content_type, len(payload), extra)
            self.wfile.write(payload)

        def _error(self, status, message):
            self._respond({"error": str(message)}, status)

        def _safe_request(self):
            # Prevent other origins and DNS rebinding from operating a user's local server.
            accepted = f"127.0.0.1:{self.server.server_address[1]}"
            if self.headers.get("Host") != accepted:
                self._error(403, "仅允许通过 127.0.0.1 访问本地服务")
                return False
            origin = self.headers.get("Origin")
            if origin and origin != "http://" + accepted:
                self._error(403, "拒绝跨站请求")
                return False
            return True

        def _json(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise ValidationError("无效的请求长度") from exc
            if not 0 < size <= 64 * 1024:
                raise ValidationError("JSON 请求为空或超过 64 KB")
            try:
                return json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError) as exc:
                raise ValidationError("查询条件不是有效的 JSON") from exc

        def do_GET(self):
            if not self._safe_request():
                return
            path = urlparse(self.path).path
            try:
                assets = {"/": "index.html", "/app.js": "app.js", "/styles.css": "styles.css"}
                if path in assets:
                    target = HERE / "static" / assets[path]
                    payload = target.read_bytes()
                    content_type = {"/": "text/html; charset=utf-8", "/app.js": "text/javascript; charset=utf-8", "/styles.css": "text/css; charset=utf-8"}[path]
                    self._respond(payload, content_type=content_type)
                elif path == "/api/health":
                    self._respond({"status": "ok", "mode": "loopback-only", "limits": {"max_upload_mb": 20, "max_columns": 60, "max_rows": 100000}})
                elif path == "/api/datasets":
                    self._respond({"datasets": list_datasets(base)})
                else:
                    m = ID_ROUTE.fullmatch(path)
                    if not m:
                        return self._error(404, "页面或资源不存在")
                    ds, suffix = m.groups()
                    if suffix == "download":
                        source = data_path(base, ds)
                        dataset_info(base, ds)
                        payload = source.read_bytes()
                        self._respond(payload, content_type="application/vnd.sqlite3", extra={"Content-Disposition": f'attachment; filename="dataset-{ds}.sqlite3"'})
                    elif suffix is None:
                        self._respond(dataset_info(base, ds))
                    else:
                        self._error(405, "请使用 POST 请求")
            except ValidationError as exc:
                self._error(422, exc)
            except OSError:
                self._error(500, "读取文件失败")

        def do_POST(self):
            if not self._safe_request():
                return
            if self.headers.get("X-Workbench-Request") != "1":
                return self._error(403, "缺少同源写入请求标识")
            path = urlparse(self.path)
            try:
                if path.path == "/api/import":
                    try:
                        length = int(self.headers.get("Content-Length", "0"))
                    except ValueError as exc:
                        raise ValidationError("上传长度无效") from exc
                    if length > MAX_UPLOAD_BYTES:
                        return self._error(413, "文件超过 20 MB 限制")
                    if length < 1:
                        raise ValidationError("文件不能为空")
                    params = parse_qs(path.query)
                    filename = params.get("filename", [""])[0]
                    encoding = params.get("encoding", ["utf-8-sig"])[0]
                    delimiter = params.get("delimiter", ["auto"])[0]
                    result = import_bytes(base, filename, self.rfile.read(length), encoding, delimiter)
                    self._respond(result, status=201)
                else:
                    m = ID_ROUTE.fullmatch(path.path)
                    if not m:
                        return self._error(404, "接口不存在")
                    ds, operation = m.groups()
                    if operation not in {"query", "export"}:
                        return self._error(405, "此资源不支持 POST")
                    spec = self._json()
                    if operation == "query":
                        self._respond(query_dataset(base, ds, spec))
                    else:
                        payload = export_csv(base, ds, spec)
                        self._respond(payload, content_type="text/csv; charset=utf-8", extra={"Content-Disposition": f'attachment; filename="dataset-{ds}-results.csv"'})
            except ValidationError as exc:
                self._error(422, exc)
            except (OSError, sqlite3.Error):
                self._error(500, "数据库读写失败")

        def log_message(self, fmt, *args):
            # No URLs, filenames, filter values or user data in logs.
            sys.stderr.write("[local-http] " + ("%s %s" % (self.command, self.path.split("?")[0])) + "\n")

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local CSV/TSV -> SQLite workbench, no external dependencies")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--data-dir", type=Path, default=HERE / "data")
    args = parser.parse_args()
    server = make_server(args.port, args.data_dir)
    print(f"本地数据工作台：http://127.0.0.1:{server.server_address[1]}/")
    print(f"数据库保存目录：{args.data_dir.resolve()}")
    print("仅监听本机；按 Ctrl+C 停止。请勿对公网开放。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
