from __future__ import annotations

import http.client
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / 'ff_experiment'))
from ff_adapter import make_ff_server, ff_demo_rows, ff_dataset_list
from core import import_bytes, list_datasets

SAMPLE = (HERE / 'ff_experiment/samples/设备遥测样例.csv').read_bytes()


class FFAdapterTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.server = make_ff_server(port=0, data_dir=self.base)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown(); self.thread.join(timeout=3); self.server.server_close()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        con = http.client.HTTPConnection('127.0.0.1', self.port, timeout=4)
        head = {'Host': f'127.0.0.1:{self.port}', **(headers or {})}
        con.request(method, path, body=body, headers=head)
        response = con.getresponse(); status = response.status; payload = response.read(); con.close()
        return status, payload

    def upload(self, origin=None):
        boundary = 'FF-STUDIO-BOUNDARY'
        multipart = b'--' + boundary.encode() + b'\r\nContent-Disposition: form-data; name="file"; filename="demo.csv"\r\nContent-Type: text/csv\r\n\r\n' + SAMPLE + b'\r\n--' + boundary.encode() + b'--\r\n'
        headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary}
        if origin is not None: headers['Origin'] = origin
        return self.request('POST', '/api/ff/upload', multipart, headers)

    def test_browser_formdata_ff_upload_produces_real_sqlite(self):
        code, payload = self.upload(f'http://127.0.0.1:{self.port}')
        self.assertEqual(code, 201, payload)
        doc = json.loads(payload)
        self.assertEqual(doc['row_count'], 10)
        self.assertEqual(len(list_datasets(self.base)), 1)
        self.assertEqual((self.base / ('dataset_' + doc['id'] + '.sqlite3')).read_bytes()[:16], b'SQLite format 3\x00')

    def test_missing_or_cross_site_origin_rejected_without_db(self):
        self.assertEqual(self.upload(None)[0], 403)
        self.assertEqual(self.upload('https://other.example')[0], 403)
        self.assertEqual(len(list_datasets(self.base)), 0)

    def test_get_live_studio_table_contracts_and_query_scope(self):
        self.upload(f'http://127.0.0.1:{self.port}')
        code, body = self.request('GET', '/api/ff/datasets?page=1&pageSize=8')
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)['data']['total'], 1)
        code, body = self.request('GET', '/api/ff/latest-records?page=1&pageSize=10&search=FW-02&filterField=state&filter=%E5%91%8A%E8%AD%A6&sort=temp&order=desc')
        self.assertEqual(code, 200, body)
        result = json.loads(body)['data']
        self.assertEqual(result['total'], 3)
        self.assertEqual(len(result['items']), 3)
        self.assertTrue(all(d['device'] == 'FW-02' and d['state'] == '告警' for d in result['items']))
        self.assertEqual(result['items'][0]['temp'], '43.9')

    def test_only_fixed_six_column_fixture_accepted_in_sample_table(self):
        import_bytes(self.base, 'other.csv', 'foo,bar\na,b\n'.encode())
        self.assertEqual(self.request('GET', '/api/ff/latest-records')[0], 422)
        self.assertEqual(self.request('GET', '/api/ff/datasets')[0], 200)

    def test_source_query_rejects_unknown_sort(self):
        self.assertEqual(self.request('GET', '/api/ff/datasets?sortBy=__proto__')[0], 422)
        import_bytes(self.base, 'demo.csv', SAMPLE)
        self.assertEqual(self.request('GET', '/api/ff/latest-records?sort=unknown')[0], 422)

    def test_original_api_remains_protected_and_operational(self):
        self.assertEqual(self.request('POST', '/api/import?filename=demo.csv', SAMPLE, {'Content-Type':'application/octet-stream'})[0], 403)
        code, body = self.request('POST', '/api/import?filename=demo.csv', SAMPLE, {'Content-Type':'application/octet-stream', 'X-Workbench-Request':'1'})
        self.assertEqual(code, 201, body)
        code, body = self.request('GET', '/api/datasets')
        self.assertEqual(code, 200)
        self.assertEqual(len(json.loads(body)['datasets']), 1)


if __name__ == '__main__':
    unittest.main()

class FFExportCoHostingTest(unittest.TestCase):
    def test_optional_static_dist_is_same_origin_and_does_not_replace_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dist = root / 'dist'; dist.mkdir(); (dist / 'assets').mkdir()
            (dist / 'index.html').write_text('<div>FF built export fixture</div>',encoding='utf8')
            (dist / 'assets' / 'app.js').write_text('console.log("mock")',encoding='utf8')
            server = make_ff_server(0, root/'data', dist)
            t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
            def get(path):
                conn=http.client.HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
                conn.request('GET',path,headers={'Host':f'127.0.0.1:{server.server_address[1]}'})
                res=conn.getresponse();result=res.status,res.read(),res.getheader('Content-Security-Policy');conn.close();return result
            try:
                self.assertEqual(get('/')[0],200)
                self.assertIn(b'FF built export fixture',get('/datasets')[1])
                self.assertEqual(get('/assets/app.js')[0],200)
                self.assertEqual(get('/api/ff/datasets')[0],200)
                self.assertEqual(get('/.secret')[0],404)
            finally:
                server.shutdown();t.join(timeout=3);server.server_close()
