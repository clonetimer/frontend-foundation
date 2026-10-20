"""Reproducible common-subset and feature-gap evidence without UI/browser claims."""
import json, hashlib, tempfile, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'ff_experiment'))
from core import import_bytes, query_dataset, export_csv, dataset_info
from ff_adapter import ff_dataset_list, ff_demo_rows


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

with tempfile.TemporaryDirectory() as temp:
    folder=Path(temp)
    sample=HERE/'ff_experiment/samples/设备遥测样例.csv'
    db=import_bytes(folder,'设备遥测样例.csv',sample.read_bytes())
    names={item['name']:item['id'] for item in db['columns']}
    subset={'filters':[{'column': names['设备编号'], 'operator':'contains','value':'FW-02'},
                       {'column': names['状态'], 'operator':'eq','value':'告警'}],
            'page':1,'page_size':10}
    a=query_dataset(folder,db['id'],subset)
    b=ff_demo_rows(folder, {'page':['1'],'pageSize':['10'],'search':['FW-02'],'filter':['告警'],'sort':['temp'],'order':['asc']})['data']
    ids_a=sorted(row['row_number'] for row in a['rows'])
    ids_b=sorted(row['id'] for row in b['items'])
    if a['total']!=b['total'] or ids_a!=ids_b:
        raise AssertionError('Common-subset results not equivalent')
    advanced={'filters':[{'column': names['设备编号'],'operator':'eq','value':'FW-02'},
                         {'column': names['温度'],'operator':'gte','value':'42'}],
              'page':1,'page_size':10}
    advanced_count=query_dataset(folder,db['id'],advanced)['total']
    if advanced_count != 2 or b['total'] != 3:
        raise AssertionError('Expected numeric range gap not observed')
    archive=folder/('dataset_'+db['id']+'.sqlite3')
    result={'baseline_original_source':{'app_py_sha256':sha(HERE/'ff_experiment/app.py'),'core_py_sha256':sha(HERE/'ff_experiment/core.py')},
           'sample_sha256':sha(sample),'sqlite_header_valid':archive.read_bytes().startswith(b'SQLite format 3\x00'),
           'database_rows':db['row_count'],
           'common_intersection':{'criteria':'device CONTAINS FW-02 AND status EQ 告警','baseline_rows':a['total'],'ff_adapted_rows':b['total'],'same_record_ids':ids_a==ids_b,'record_ids':ids_a},
           'advanced_business_query':{'criteria':'device EQ FW-02 AND temperature GTE 42','baseline_rows':advanced_count,'ff_studio_table_can_express_this_with_native_controls':False,
                                      'reason':'fixed search + one enum filter + a fixed sort; no numeric threshold rule or multi-filter builder'},
           'studio_json':{'pages':3,'sources':2,'widgets':3,'schema':'pattern-atlas-studio v1','runtime_import_test':'NOT_RUN'},
           'browser_end_to_end':'BLOCKED_OR_NOT_RUN',
           'ff_independent_react_zip':'NOT_GENERATED',
           'full_equivalence':'NO'}
    out=HERE/'evidence/comparison-proof.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
