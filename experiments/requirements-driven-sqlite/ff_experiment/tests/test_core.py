import csv
import io
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path

from core import import_bytes, dataset_info, query_dataset, export_csv, list_datasets, ValidationError, MAX_UPLOAD_BYTES


class CoreContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        self.csv = (Path(__file__).resolve().parent.parent / 'samples' / '设备遥测样例.csv').read_bytes()
        self.info = import_bytes(self.path, '设备遥测样例.csv', self.csv)

    def tearDown(self):
        self.temp.cleanup()

    def test_import_is_real_sqlite_with_rows_and_metadata(self):
        self.assertEqual(self.info['row_count'], 10)
        ds = self.info['id']
        self.assertEqual(dataset_info(self.path, ds)['filename'], '设备遥测样例.csv')
        self.assertEqual(len(list_datasets(self.path)), 1)
        saved = self.path / ('dataset_' + ds + '.sqlite3')
        self.assertEqual(saved.read_bytes()[:16], b'SQLite format 3\x00')
        with closing(sqlite3.connect(saved)) as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM records').fetchone()[0], 10)
            self.assertEqual(conn.execute('SELECT "c_1" FROM records WHERE row_number=3').fetchone()[0], 'FW-02')

    def test_numeric_comparison_and_combined_filters(self):
        query = {'filters':[
            {'column':'c_1','operator':'eq','value':'FW-02'},
            {'column':'c_2','operator':'gte','value':'42'}],
            'sort':{'column':'c_2','direction':'desc'}, 'page_size':2, 'page':1}
        result = query_dataset(self.path, self.info['id'], query)
        self.assertEqual(result['total'], 2)
        self.assertEqual([r['values']['c_2'] for r in result['rows']], ['43.9','42.1'])
        exported = export_csv(self.path, self.info['id'], query)
        decoded = list(csv.reader(io.StringIO(exported.decode('utf-8-sig'))))
        self.assertEqual(decoded[0], ['采集时间','设备编号','温度','转速','状态','备注'])
        self.assertEqual(len(decoded), 3)
        self.assertEqual(decoded[1][2], '43.9')

    def test_page_queries_stable_and_csv_export_is_all_matches(self):
        spec = {'filters':[{'column':'c_4','operator':'eq','value':'正常'}], 'page':1,'page_size':2}
        first = query_dataset(self.path,self.info['id'],spec)
        self.assertEqual(first['total'],6)
        self.assertEqual(len(first['rows']),2)
        spec['page']=2
        second = query_dataset(self.path,self.info['id'],spec)
        self.assertEqual([r['row_number'] for r in second['rows']],[5,7])
        content = export_csv(self.path,self.info['id'],spec)
        self.assertEqual(len(list(csv.reader(io.StringIO(content.decode('utf-8-sig'))))),7)

    def test_bad_files_rejected_without_partial_databases(self):
        before = len(list(self.path.glob('*.sqlite3')))
        cases = [
            ('missing.csv',b''),
            ('oops.csv',b'first,second\n1\n'),
            ('headers.csv',b'a,,c\n1,2,3\n'),
            ('empty.csv',b'a,b\n'),
            ('bad.xlsx',b'a,b\n1,2\n'),
            ('oversize.csv', b'x' * (MAX_UPLOAD_BYTES+1)),
        ]
        for name, data in cases:
            with self.subTest(file=name),self.assertRaises(ValidationError):
                import_bytes(self.path,name,data)
        self.assertEqual(len(list(self.path.glob('*.sqlite3'))),before)

    def test_duplicate_headers_are_repaired_explicitly(self):
        info=import_bytes(self.path,'dupe.csv','temp,temp,temp_2\n1,2,3\n'.encode())
        self.assertEqual([c['name'] for c in info['columns']],['temp','temp_2','temp_2_2'])
        self.assertEqual(len(info['warnings']),2)

    def test_tab_and_gb18030_are_supported(self):
        content='编号\t温度\n0012\t35\n0013\t38\n'.encode('gb18030')
        info=import_bytes(self.path,'china.txt',content,encoding='gb18030',delimiter='\t')
        self.assertEqual(info['columns'][0]['type'],'text')
        self.assertEqual(info['columns'][1]['type'],'number')
        self.assertEqual(query_dataset(self.path,info['id'],{'filters':[]})['rows'][0]['values']['c_0'],'0012')

    def test_no_SQL_injection_or_arbitrary_column_sort(self):
        ds=self.info['id']
        for spec in [
            {'filters':[{'column':'c_1" OR 1=1 --','operator':'eq','value':'anything'}]},
            {'filters':[{'column':'c_2','operator':'gte','value':'0 OR 1=1'}]},
            {'filters':[{'column':'c_4','operator':'gt','value': '10'}]},
            {'filters':[],'sort':{'column':'c_2;DROP TABLE records','direction':'asc'}},
            {'filters':[],'page_size':10000},
            {'filters':[],'page':True},
        ]:
            with self.subTest(spec=spec),self.assertRaises(ValidationError):
                query_dataset(self.path,ds,spec)
        self.assertEqual(query_dataset(self.path,ds,{})['total'],10)

    def test_like_metacharacters_are_literal_and_formula_export_is_neutralized(self):
        info=import_bytes(self.path,'formulas.csv','tag,text\nA_1,=1+1\nB%2,normal\n'.encode())
        ds=info['id']
        results=query_dataset(self.path,ds,{'filters':[{'column':'c_0','operator':'contains','value':'_'}]})
        self.assertEqual(results['total'],1)
        results=query_dataset(self.path,ds,{'filters':[{'column':'c_0','operator':'contains','value':'%'}]})
        self.assertEqual(results['total'],1)
        exported=export_csv(self.path,ds,{})
        self.assertIn("'=1+1",exported.decode('utf-8-sig'))
        # Persisted user data remains unchanged.
        self.assertEqual(query_dataset(self.path,ds,{})['rows'][0]['values']['c_1'],'=1+1')

    def test_undeclared_database_ids_cannot_traverse_paths(self):
        with self.assertRaises(ValidationError):
            dataset_info(self.path,'../../secrets')
        with self.assertRaises(ValidationError):
            dataset_info(self.path,'x'*32)

    def test_filename_injection_never_affects_sql_schema(self):
        info=import_bytes(self.path,'表格.csv','"x); DROP TABLE records;--",name\na,b\n'.encode())
        self.assertEqual(query_dataset(self.path,info['id'],{})['total'],1)


if __name__=='__main__':
    unittest.main()
