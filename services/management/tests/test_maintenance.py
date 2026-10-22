"""Disposable SQLite integration tests for backup/restore, page grants and deployment."""
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import create_admin, database, initialize
from maintenance import restore, server_lock, snapshot, sync_pages
from launch import launch
from server import ManagementApp

class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "management.sqlite3"
        initialize(str(self.db))
        self.admin = create_admin(str(self.db), "test_admin", "ThisIsALongSecretPassword123!")
        self.manifest = self.root / "pages.json"
        self.manifest.write_text(json.dumps({"pages":[{"id":"overview","title":"业务总览"},{"id":"data-search","title":"数据查询"}]}),encoding="utf8")

    def tearDown(self):
        self.temp.cleanup()

    def test_online_backup_atomic_restore_and_invalidates_sessions(self):
        with database(str(self.db)) as db:
            db.execute("INSERT INTO sessions(token_hash,user_id,expires_at,createdAt) VALUES(?,?,?,?)",
                       ("abc",self.admin,4102444800,"now"))
        backup = self.root / "backups" / "snapshot.sqlite3"
        snapshot(self.db,backup)
        with self.assertRaises(ValueError):
            snapshot(self.db,backup)
        with database(str(self.db)) as db:
            db.execute("INSERT INTO dictionaries(id,name,code,value,createdAt,updatedAt) "
                       "VALUES('d2','Before restore','r2','one','now','now')")
        with self.assertRaises(ValueError):
            restore(backup,self.db,False)
        with server_lock(self.db):
            with self.assertRaises(RuntimeError):
                restore(backup,self.db,True)
        previous = restore(backup,self.db,True)
        self.assertTrue(previous.is_file())
        with database(str(self.db)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0],0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM dictionaries WHERE id='d2'").fetchone()[0],0)
        with database(str(previous)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM dictionaries WHERE id='d2'").fetchone()[0],1)

    def test_invalid_backup_fails_closed_without_touching_live_database(self):
        corrupted=self.root/"corrupt.sqlite3"
        corrupted.write_bytes(b"not a sqlite database")
        with self.assertRaises((sqlite3.DatabaseError,ValueError)):
            restore(corrupted,self.db,True)
        with database(str(self.db)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0],1)

    def test_page_manifest_registration_is_idempotent_and_preserves_existing_grants(self):
        self.assertEqual(sync_pages(self.db,self.manifest),2)
        self.assertEqual(sync_pages(self.db,self.manifest),0)
        with database(str(self.db)) as db:
            db.execute("UPDATE menus SET status='disabled' WHERE id='page-overview'")
        self.assertEqual(sync_pages(self.db,self.manifest),0)
        with database(str(self.db)) as db:
            self.assertEqual(db.execute("SELECT status FROM menus WHERE id='page-overview'").fetchone()[0],"disabled")
        self.manifest.write_text(json.dumps({"pages":[{"id":"system-roles","title":"Reserved"}]}),encoding="utf8")
        with self.assertRaises(ValueError):sync_pages(self.db,self.manifest)

    def test_first_party_page_authorization_and_static_allowlist(self):
        sync_pages(self.db,self.manifest)
        dist=self.root/"dist"
        (dist/"assets").mkdir(parents=True)
        (dist/"index.html").write_text("<!doctype html><h1>FF Test</h1>",encoding="utf8")
        (dist/"assets"/"app.js").write_text("console.log('ok')",encoding="utf8")
        app=ManagementApp(str(self.db),str(dist))
        def call(path,method="GET",cookie=""):
            env={"REQUEST_METHOD":method,"PATH_INFO":path,"QUERY_STRING":"",
                 "wsgi.input":io.BytesIO(b""),"HTTP_COOKIE":cookie,
                 "CONTENT_LENGTH":"0","HTTP_HOST":"localhost:8765"}
            result={}
            def begin(status,headers):
                result["status"]=int(status[:3])
                result["headers"]=dict(headers)
            payload=b"".join(app(env,begin))
            return result["status"],payload
        self.assertEqual(call("/")[0],200)
        self.assertEqual(call("/assets/app.js")[0],200)
        self.assertEqual(call("/../../management.sqlite3")[0],404)
        self.assertEqual(call("/api/system/pages/overview/authorize")[0],401)
        token="local-testing-session-cookie"
        from db import token_hash
        with database(str(self.db)) as db:
            db.execute("INSERT INTO sessions(token_hash,user_id,expires_at,createdAt) VALUES(?,?,?,?)",
                       (token_hash(token),self.admin,4102444800,"now"))
        self.assertEqual(call("/api/system/pages/overview/authorize",cookie="ff_session="+token)[0],200)
        self.assertEqual(call("/api/system/pages/access",cookie="ff_session="+token)[0],200)
        with database(str(self.db)) as db:
            db.execute("UPDATE menus SET status='disabled' WHERE id='page-overview'")
        self.assertEqual(call("/api/system/pages/overview/authorize",cookie="ff_session="+token)[0],404)

    def test_launcher_preflight_does_not_touch_database(self):
        base=self.root/"export"
        (base/"management").mkdir(parents=True)
        (base/"dist").mkdir()
        (base/"dist"/"index.html").write_text("<html></html>",encoding="utf8")
        (base/"package.json").write_text('{"name":"synthetic-export"}',encoding="utf8")
        (base/"management"/"page-permissions.json").write_text('{"pages":[]}',encoding="utf8")
        db=base/"management"/"instance"/"db.sqlite3"
        launch(base,db,8765,True,True,True)
        self.assertFalse(db.exists())

if __name__=="__main__":unittest.main()
