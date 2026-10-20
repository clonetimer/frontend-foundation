"""Optional browser smoke, requires an installed Chromium + Playwright (not runtime deps)."""
import io
import csv
import os
import sys
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import make_server

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'evidence'

def main():
    with tempfile.TemporaryDirectory() as folder:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        server = make_server(0, Path(folder))
        thread = threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
                context=browser.new_context(viewport={'width':1440,'height':950},accept_downloads=True)
                page=context.new_page()
                errs=[]
                page.on('pageerror',lambda exc:errs.append(str(exc)))
                page.goto(f'http://127.0.0.1:{server.server_address[1]}/',wait_until='networkidle')
                page.screenshot(path=str(ROOT/'evidence'/'workbench-empty.png'),full_page=True)
                sample=str(ROOT/'samples'/'设备遥测样例.csv')
                page.locator('input[type=file]').set_input_files(sample)
                page.locator('#import-btn').click()
                page.locator('#import-result').get_by_text('导入成功',exact=False).wait_for(timeout=10000)
                page.get_by_text('找到 10 条匹配记录').wait_for(timeout=10000)
                # First row selection: 设备编号 FW-02 and 温度 >= 42
                select=page.locator('#filters .filter-row').first.locator('select')
                select.nth(0).select_option('c_1')
                select.nth(1).select_option('eq')
                page.locator('#filters .filter-row').first.locator('input').first.fill('FW-02')
                page.locator('#add-filter').click()
                select=page.locator('#filters .filter-row').nth(1).locator('select')
                select.nth(0).select_option('c_2')
                select.nth(1).select_option('gte')
                page.locator('#filters .filter-row').nth(1).locator('input').first.fill('42')
                page.locator('#query-btn').click()
                page.get_by_text('找到 2 条匹配记录').wait_for(timeout=10000)
                rows=page.locator('#result-body tr')
                assert rows.count()==2, f'Expected 2 visible rows got {rows.count()}'
                page.screenshot(path=str(ROOT/'evidence'/'workbench-filtered.png'),full_page=True)
                with page.expect_download() as evt:
                    page.locator('#export-btn').click()
                download=evt.value
                assert download.suggested_filename.endswith('-results.csv')
                target=ROOT/'evidence'/'browser-export.csv'
                download.save_as(str(target))
                data=list(csv.reader(io.StringIO(target.read_bytes().decode('utf-8-sig'))))
                assert len(data)==3 and data[1][1]=='FW-02' and data[2][1]=='FW-02',data
                with page.expect_download() as evt:
                    page.locator('#download-db-btn').click()
                saved=ROOT/'evidence'/'browser-download.sqlite3'
                evt.value.save_as(str(saved))
                assert saved.read_bytes().startswith(b'SQLite format 3\x00')
                assert not errs,errs
                # persisted, after reload show datasets again
                page.reload(wait_until='networkidle')
                assert page.locator('.dataset-card').count()==1
                print('BROWSER PASS: import → 10 SQLite rows → 2 filtered rows → 3-line CSV → downloaded SQLite → refresh retained; zero page errors')
                browser.close()
        finally:
            server.shutdown();server.server_close();thread.join(timeout=5)

if __name__=='__main__': main()
