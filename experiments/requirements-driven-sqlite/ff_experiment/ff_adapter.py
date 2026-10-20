"""Evidence-only compatibility facade for unchanged FF Studio 0.21.0 widget contracts.

Wraps the original local app without modifying original import/query/export implementation.
This is NOT production auth, and does NOT enable arbitrary database selection or general dynamic queries.
"""
from __future__ import annotations

import argparse
import mimetypes
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from app import make_server
from core import (MAX_UPLOAD_BYTES, ValidationError, dataset_info, import_bytes,
                  list_datasets, query_dataset)

REQUIRED_DEMO_FIELDS = ["采集时间", "设备编号", "温度", "转速", "状态", "备注"]
FLAT_FIELDS = ["time", "device", "temp", "speed", "state", "note"]


def _positive_int(params, name, default_value, maximum):
    raw = params.get(name, [str(default_value)])
    if len(raw) != 1 or not raw[0].isdigit():
        raise ValidationError(f"{name} 必须是正整数")
    value = int(raw[0])
    if not 1 <= value <= maximum:
        raise ValidationError(f"{name} 不在允许范围 1..{maximum}")
    return value


def ff_dataset_list(data_dir: Path, params: dict) -> dict:
    data = list_datasets(data_dir)
    search = params.get('search', [''])[0].strip().casefold()
    if len(search) > 120:
        raise ValidationError('搜索文本过长')
    if search:
        data = [d for d in data if search in d['filename'].casefold()]
    order_by = params.get('sortBy', ['imported_at'])[0]
    if order_by not in {'imported_at', 'filename', 'row_count'}:
        raise ValidationError('不支持的排序字段')
    direction = params.get('sortOrder', ['desc'])[0]
    if direction not in {'asc', 'desc'}:
        raise ValidationError('不支持的排序方向')
    data.sort(key=lambda d: (d[order_by], d['id']), reverse=direction == 'desc')
    page = _positive_int(params, 'page', 1, 100000)
    size = _positive_int(params, 'pageSize', 8, 20)
    start = (page - 1) * size
    return {'data': {'items': data[start:start + size], 'total': len(data)}}


def ff_demo_rows(data_dir: Path, params: dict) -> dict:
    sources = list_datasets(data_dir)
    if not sources:
        return {'data': {'items': [], 'total': 0}}
    ds = sources[0]['id']
    info = dataset_info(data_dir, ds)
    names = [col['name'] for col in info['columns']]
    # Intentional limitation: Studio fixed table columns cannot render arbitrary CSV schema.
    if names != REQUIRED_DEMO_FIELDS:
        raise ValidationError('FF 对照页只支持六列示例结构，任意列结构需定制组件')
    col = {c['name']: c['id'] for c in info['columns']}
    filters = []
    search = params.get('search', [''])[0].strip()
    if search:
        filters.append({'column': col['设备编号'], 'operator': 'contains', 'value': search})
    status = params.get('filter', [''])[0]
    if status:
        if status not in {'正常', '告警'}:
            raise ValidationError('不支持的状态筛选值')
        filters.append({'column': col['状态'], 'operator': 'eq', 'value': status})
    sort_column = params.get('sort', [''])[0]
    if sort_column and sort_column not in FLAT_FIELDS:
        raise ValidationError('不支持的排序字段')
    sort_key = col[REQUIRED_DEMO_FIELDS[FLAT_FIELDS.index(sort_column)]] if sort_column else ''
    sort_order = params.get('order', ['asc'])[0]
    if sort_order not in {'asc', 'desc'}:
        raise ValidationError('不支持的排序方向')
    page = _positive_int(params, 'page', 1, 100000)
    size = _positive_int(params, 'pageSize', 10, 20)
    result = query_dataset(data_dir, ds, {'filters': filters, 'sort': {'column': sort_key, 'direction': sort_order}, 'page': page, 'page_size': size})
    values = [c['id'] for c in info['columns']]
    items = [{'id': row['row_number'], **{key: row['values'].get(values[i], '') for i, key in enumerate(FLAT_FIELDS)}} for row in result['rows']]
    return {'data': {'items': items, 'total': result['total']}}


def _parse_browser_form(content_type: str, data: bytes) -> tuple[str, bytes]:
    if not content_type.startswith('multipart/form-data;') or len(content_type) > 240:
        raise ValidationError('FF 上传必须为 multipart/form-data')
    if b'\x00' in content_type.encode():
        raise ValidationError('错误的 multipart 头')
    try:
        msg = BytesParser(policy=default).parsebytes(b'MIME-Version: 1.0\r\nContent-Type: ' + content_type.encode('ascii') + b'\r\n\r\n' + data)
    except (UnicodeError, ValueError) as exc:
        raise ValidationError('无法解析 multipart 文件') from exc
    if not msg.is_multipart():
        raise ValidationError('上传内容不是 multipart')
    parts = list(msg.iter_parts())
    if len(parts) != 1 or parts[0].get_content_disposition() != 'form-data' or parts[0].get_param('name', header='content-disposition') != 'file':
        raise ValidationError('上传必须恰好包含一个名为 file 的文件字段')
    filename = parts[0].get_filename()
    if not filename or '/' in filename or '\\' in filename:
        raise ValidationError('文件名不能为空或包含路径')
    payload = parts[0].get_payload(decode=True)
    if not payload or len(payload) > MAX_UPLOAD_BYTES:
        raise ValidationError('上传文件为空或超过 20 MB')
    return filename, payload


def make_ff_server(port=8768, data_dir=None, frontend_dir=None):
    """Same loopback-only trust boundary, additional FF-compatible routes."""
    server = make_server(port=port, data_dir=data_dir)
    base = Path(data_dir) if data_dir is not None else Path(__file__).resolve().parent / 'data'
    frontend = Path(frontend_dir).resolve() if frontend_dir else None
    if frontend is not None and not (frontend / 'index.html').is_file():
        raise ValueError('FF 导出目录需要包含 index.html')
    Original = server.RequestHandlerClass

    class FFHandler(Original):
        def do_GET(self):
            url = urlsplit(self.path)
            if url.path not in {'/api/ff/datasets', '/api/ff/latest-records'}:
                if frontend is not None and not url.path.startswith('/api/'):
                    if not self._safe_request():
                        return
                    relative = url.path.lstrip('/')
                    # SPA routing is restricted to extensionless paths. Never leak application source files.
                    if relative == '' or ('.' not in Path(relative).name and not relative.startswith('.')):
                        relative = 'index.html' if not relative or not (frontend / relative).is_file() else relative
                    target = (frontend / relative).resolve()
                    if not target.is_relative_to(frontend) or any(part.startswith('.') for part in Path(relative).parts) or not target.is_file():
                        return self._error(404, '前端资源不存在')
                    mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                    payload = target.read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type', mime + ('; charset=utf-8' if mime in {'text/html','text/css','text/javascript','application/javascript'} else ''))
                    self.send_header('Content-Length', str(len(payload)))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.send_header('X-Frame-Options', 'DENY')
                    # Ant Design CSS-in-JS needs inline CSS. Scripts remain same-origin only.
                    self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'")
                    self.end_headers(); self.wfile.write(payload)
                    return
                return super().do_GET()
            if not self._safe_request():
                return
            try:
                params = parse_qs(url.query, keep_blank_values=True)
                answer = ff_dataset_list(base, params) if url.path == '/api/ff/datasets' else ff_demo_rows(base, params)
                self._respond(answer)
            except ValidationError as exc:
                self._error(422, str(exc))

        def do_POST(self):
            url = urlsplit(self.path)
            if url.path != '/api/ff/upload':
                return super().do_POST()
            if not self._safe_request():
                return
            # Studio's current FileUploadWidget cannot set X-Workbench-Request.
            # Preserve local-only + explicit same-origin CSRF defense, do not relax original /api/import.
            expected = f'http://127.0.0.1:{self.server.server_address[1]}'
            if self.headers.get('Origin') != expected or self.headers.get('Sec-Fetch-Site', 'same-origin') != 'same-origin':
                return self._error(403, 'FF 适配上传需要明确的同源 Origin')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 1 <= length <= MAX_UPLOAD_BYTES + 16 * 1024:
                    return self._error(413, '上传体积无效或超限')
                filename, payload = _parse_browser_form(self.headers.get('Content-Type', ''), self.rfile.read(length))
                result = import_bytes(base, filename, payload, 'utf-8-sig', 'auto')
                self._respond(result, status=201)
            except (ValidationError, ValueError) as exc:
                self._error(422, str(exc))

    server.RequestHandlerClass = FFHandler
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='FF Studio comparison adapter, loopback only')
    parser.add_argument('--port', type=int, default=8768)
    parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parent / 'data')
    parser.add_argument('--frontend-dir', type=Path, help='Optional built FF exported React dist/ served on the same origin')
    args = parser.parse_args()
    httpd = make_ff_server(args.port, args.data_dir, args.frontend_dir)
    print(f'FF 兼容 API 示例：http://127.0.0.1:{httpd.server_address[1]}/')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
