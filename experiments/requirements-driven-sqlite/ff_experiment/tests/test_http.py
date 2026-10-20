import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from app import make_server


class HTTPContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=make_server(0, Path(cls.temp.name))
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=5);cls.temp.cleanup()

    def request(self,method,path,data=None,headers=None,host=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=7)
        h={'Host':host or f'127.0.0.1:{self.port}',**(headers or {})}
        conn.request(method,path,body=data,headers=h)
        resp=conn.getresponse()
        payload=resp.read()
        status,ct=resp.status,resp.getheader('Content-Type','')
        conn.close()
        return status,ct,payload

    def test_local_http_import_search_export_download_restart(self):
        status,_,body=self.request('GET','/api/health')
        self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['mode'],'loopback-only')
        status,_,body=self.request('POST','/api/import?filename=records.csv',b'key,value\na,10\nb,20\nc,30\n',{'X-Workbench-Request':'1'})
        self.assertEqual(status,201)
        dataset=json.loads(body); ds=dataset['id']
        self.assertEqual(dataset['row_count'],3)
        filters={'filters':[{'column':'c_1','operator':'gte','value':'20'}],'page_size':1}
        status,_,body=self.request('POST',f'/api/datasets/{ds}/query',json.dumps(filters).encode(),{'X-Workbench-Request':'1'})
        self.assertEqual(status,200)
        result=json.loads(body);self.assertEqual(result['total'],2);self.assertEqual(len(result['rows']),1)
        status,ct,body=self.request('POST',f'/api/datasets/{ds}/export',json.dumps(filters).encode(),{'X-Workbench-Request':'1'})
        self.assertEqual(status,200);self.assertTrue(ct.startswith('text/csv'))
        self.assertEqual(body.decode('utf-8-sig').strip().splitlines(),['key,value','b,20','c,30'])
        status,ct,body=self.request('GET',f'/api/datasets/{ds}/download')
        self.assertEqual(status,200);self.assertEqual(body[:16],b'SQLite format 3\x00')
        status,_,body=self.request('GET','/api/datasets')
        self.assertEqual(status,200);self.assertTrue(any(d['id']==ds for d in json.loads(body)['datasets']))
        # A second app instance with the same persistent data directory sees same DB.
        check=make_server(0,Path(self.temp.name))
        try:
            self.assertEqual(check.server_address[0],'127.0.0.1')
        finally:check.server_close()

    def test_csrf_dns_rebinding_and_missing_header_are_blocked(self):
        status,_,_=self.request('POST','/api/import?filename=x.csv',b'a\n1\n')
        self.assertEqual(status,403)
        status,_,_=self.request('POST','/api/import?filename=x.csv',b'a\n1\n',{'X-Workbench-Request':'1','Origin':'https://evil.example'})
        self.assertEqual(status,403)
        status,_,_=self.request('GET','/api/datasets',host='malicious.example')
        self.assertEqual(status,403)
        status,_,_=self.request('GET','/../../etc/passwd')
        self.assertEqual(status,404)

    def test_xlsx_and_json_errors_are_actionable(self):
        status,_,body=self.request('POST','/api/import?filename=bad.xlsx',b'a,b\n1,2\n',{'X-Workbench-Request':'1'})
        self.assertEqual(status,422);self.assertIn('xlsx',json.loads(body)['error'])
        status,_,body=self.request('POST','/api/import?filename=bad.csv',b'a,b\n1\n',{'X-Workbench-Request':'1'})
        self.assertEqual(status,422);self.assertIn('第 2 行',json.loads(body)['error'])


if __name__=='__main__':unittest.main()
