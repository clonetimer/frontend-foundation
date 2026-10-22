"""Headless tests for the graphical deployment wizard and reusable server lifecycle."""
import importlib.util
import json
import socket
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gui import account_exists, environment_checks, validate_bootstrap
from launch import launch
from db import database

class GuiWizardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "management" / "instance").mkdir(parents=True)
        (self.root / "management" / "page-permissions.json").write_text(
            json.dumps({"pages": [{"id": "overview", "title": "Overview"}]}),encoding="utf-8")
        (self.root / "package.json").write_text('{"name":"synthetic"}',encoding="utf-8")
        (self.root / "dist").mkdir()
        (self.root / "dist" / "index.html").write_text("<html><title>FF</title></html>",encoding="utf-8")
        self.db = self.root / "management" / "instance" / "test.sqlite3"

    def tearDown(self):
        self.tmp.cleanup()

    def test_environment_and_bootstrap_validation_are_headless(self):
        self.assertTrue(all(ok for _,ok,_ in environment_checks(self.root)))
        self.assertFalse(account_exists(self.db))
        self.assertEqual(validate_bootstrap(" admin ", "CorrectLongPassword123!", "CorrectLongPassword123!")[0],"admin")
        for username,password,confirm in [
            ("a", "CorrectLongPassword123!", "CorrectLongPassword123!"),
            ("adm;in", "CorrectLongPassword123!", "CorrectLongPassword123!"),
            ("admin", "short", "short"),
            ("admin", "CorrectLongPassword123!", "mismatch")
        ]:
            with self.assertRaises(ValueError):
                validate_bootstrap(username, password, confirm)
        self.assertFalse(self.db.exists())

    def test_gui_import_does_not_require_display(self):
        self.assertTrue(callable(environment_checks))
        self.assertTrue(callable(validate_bootstrap))

    def test_launch_stoppable_gui_lifecycle_and_credential_bootstrap(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        started=threading.Event()
        stop=threading.Event()
        errors=[]
        urls=[]
        def run():
            try:
                launch(self.root,self.db,port,True,False,True,
                       credentials=("guiadmin","CorrectLongPassword123!"),stop_event=stop,
                       on_ready=lambda url: (urls.append(url),started.set()),
                       on_progress=lambda _: None)
            except Exception as exc:
                errors.append(str(exc))
                started.set()
        t=threading.Thread(target=run,daemon=True)
        t.start()
        try:
            self.assertTrue(started.wait(15),"service start timed out")
            self.assertEqual(errors,[])
            self.assertTrue(account_exists(self.db))
            self.assertEqual(len(urls),1)
            with urlopen(urls[0]+"/healthz",timeout=5) as r:
                self.assertEqual(r.status,200)
            with database(str(self.db)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0],1)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM menus WHERE id='page-overview'").fetchone()[0],1)
        finally:
            stop.set()
            t.join(8)
        self.assertFalse(t.is_alive(),"Service must stop and release SQLite lock before restore")

if __name__ == "__main__":
    unittest.main()
