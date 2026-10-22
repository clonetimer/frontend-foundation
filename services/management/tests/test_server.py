"""Integration tests exercise the real WSGI app against a disposable SQLite DB."""
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import create_admin, database
from server import ManagementApp


class TestManagementApi(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dbfile = os.path.join(self.tmp.name, "management.sqlite3")
        self.app = ManagementApp(self.dbfile)
        self.admin = create_admin(self.dbfile, "admin", "VeryStrongSecretPass123!")
        self.cookie = ""

    def tearDown(self):
        self.tmp.cleanup()

    def request(self, method, path, body=None, *, cookie=None, headers=None, origin="http://localhost:8765"):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else b""
        environ = {
            "REQUEST_METHOD": method, "PATH_INFO": path.split("?")[0],
            "QUERY_STRING": path.split("?", 1)[1] if "?" in path else "",
            "HTTP_HOST": "localhost:8765", "HTTP_ORIGIN": origin,
            "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(data)),
            "REMOTE_ADDR": "127.0.0.1", "wsgi.input": io.BytesIO(data),
            "HTTP_COOKIE": self.cookie if cookie is None else cookie,
        }
        if headers:
            environ.update({"HTTP_" + k.upper().replace("-", "_"): v for k, v in headers.items()})
        result = {}
        def start(status, response_headers):
            result["status"] = int(status.split()[0])
            result["headers"] = dict(response_headers)
        chunks = self.app(environ, start)
        result["body"] = json.loads(b"".join(chunks).decode("utf-8"))
        return result

    def login(self):
        result = self.request("POST", "/api/system/auth/login",
                              {"username":"admin", "password":"VeryStrongSecretPass123!"})
        self.assertEqual(result["status"], 200, result)
        self.cookie = result["headers"]["Set-Cookie"].split(";")[0]
        self.assertIn("HttpOnly", result["headers"]["Set-Cookie"])
        return result

    def test_fail_closed_and_persistent_login_audit_rate_limit(self):
        self.assertEqual(self.request("GET", "/api/system/users")["status"], 401)
        self.assertEqual(self.request("GET", "/healthz")["status"], 200)
        self.assertEqual(self.request("POST", "/api/system/auth/login",
                         {"username":"admin","password":"bad"},origin="http://evil.test")["status"],403)
        for index in range(5):
            response = self.request("POST", "/api/system/auth/login",
                                    {"username":"admin","password":"wrong"})
            self.assertEqual(response["status"],401, response)
        self.assertEqual(self.request("POST", "/api/system/auth/login",
                         {"username":"admin","password":"VeryStrongSecretPass123!"})["status"],429)
        with database(self.dbfile) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM login_attempts").fetchone()[0],5)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM login_logs").fetchone()[0],5)

    def test_crud_roles_users_permissions_and_audit(self):
        self.login()
        info = self.request("GET", "/api/system/auth/me")
        self.assertEqual(info["body"]["data"]["permissions"], ["*"])
        self.assertNotIn("password_hash", info["body"]["data"]["user"])
        role = self.request("POST", "/api/system/roles", {"name":"监测员","code":"operator","sort":1})
        self.assertEqual(role["status"],201,role)
        rid = role["body"]["data"]["id"]
        self.assertEqual(self.request("GET", "/api/system/roles?page=1&pageSize=10")["body"]["data"]["total"],2)
        user = self.request("POST", "/api/system/users",
                            {"username":"alice","name":"Alice","department":"Lab",
                             "password":"AnotherStrongSecret123!"})
        self.assertEqual(user["status"],201,user)
        uid = user["body"]["data"]["id"]
        self.assertNotIn("password_hash",str(user["body"]))
        options = self.request("GET", "/api/system/users/options")
        self.assertIn(uid,[x["id"] for x in options["body"]["data"]["items"]])
        assigned = self.request("GET",f"/api/system/roles/{rid}/users")
        self.assertEqual(assigned["body"]["data"]["ids"],[])
        self.assertEqual(self.request("PUT",f"/api/system/roles/{rid}/users",
                         {"userIds":[uid]})["status"],428)
        created = self.request("PUT",f"/api/system/roles/{rid}/users",
                    {"userIds":[uid]},headers={"If-Match":assigned["body"]["data"]["etag"]})
        self.assertEqual(created["status"],200,created)
        self.assertEqual(self.request("PUT",f"/api/system/roles/{rid}/users",
                 {"userIds":[]},headers={"If-Match":assigned["body"]["data"]["etag"]})["status"],412)
        self.assertEqual(self.request("GET",f"/api/system/roles/{rid}/users")["body"]["data"]["ids"],[uid])
        menus=self.request("GET","/api/system/menus/tree")
        self.assertEqual(menus["status"],200)
        self.assertTrue(any(x["name"]=="人员管理" for x in menus["body"]["data"]["items"]))
        revision=self.request("GET",f"/api/system/roles/{rid}/permissions")["body"]["data"]["etag"]
        updated=self.request("PUT",f"/api/system/roles/{rid}/permissions",
                             {"menuIds":["system-users"]},headers={"If-Match":revision})
        self.assertEqual(updated["status"],200,updated)
        with database(self.dbfile) as db:
            self.assertGreaterEqual(db.execute("SELECT COUNT(*) FROM operation_logs").fetchone()[0],4)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM role_menus WHERE role_id=?",(rid,)).fetchone()[0],1)
        self.assertEqual(self.request("GET","/api/system/logs/operations")["status"],200)
        self.assertEqual(self.request("POST","/api/system/logs/operations",{})["status"],405)

    def test_status_preconditions_and_user_session_revocation(self):
        self.login()
        new=self.request("POST","/api/system/users",{"username":"bob","name":"Bob","password":"AnExcellentPassword123!"})
        uid=new["body"]["data"]["id"]
        current=self.request("GET",f"/api/system/users/{uid}")["body"]["data"]
        self.assertEqual(self.request("PATCH",f"/api/system/users/{uid}",{"status":"disabled"})["status"],428)
        self.assertEqual(self.request("PATCH",f"/api/system/users/{uid}",{"status":"disabled"},
                      headers={"If-Match":'"rev-0"'})["status"],412)
        actual=self.request("PATCH",f"/api/system/users/{uid}",{"status":"disabled"},
                      headers={"If-Match":current["etag"]})
        self.assertEqual(actual["status"],200,actual)
        self.assertEqual(actual["body"]["data"]["status"],"disabled")
        self.assertEqual(self.request("PATCH",f"/api/system/users/{uid}",{"status":"enabled"},
                      headers={"If-Match":current["etag"]})["status"],412)
        self.assertEqual(self.request("DELETE",f"/api/system/users/{self.admin}")["status"],403)
        self.assertEqual(self.request("DELETE","/api/system/roles/role-root")["status"],403)

    def test_authorization_and_csrf_origin_protection(self):
        self.login()
        role=self.request("POST","/api/system/roles",{"name":"普通人员","code":"basic"})["body"]["data"]["id"]
        alice=self.request("POST","/api/system/users",{"name":"Alice","username":"alice",
                                   "password":"AnotherStrongSecret123!"})["body"]["data"]["id"]
        et=self.request("GET",f"/api/system/roles/{role}/users")["body"]["data"]["etag"]
        self.assertEqual(self.request("PUT",f"/api/system/roles/{role}/users",
                         {"userIds":[alice]},headers={"If-Match":et})["status"],200)
        notadmin=self.request("POST","/api/system/auth/login",
                 {"username":"alice","password":"AnotherStrongSecret123!"})
        self.assertEqual(notadmin["status"],200)
        limited=notadmin["headers"]["Set-Cookie"].split(";")[0]
        self.assertEqual(self.request("GET","/api/system/roles",cookie=limited)["status"],403)
        self.assertEqual(self.request("POST","/api/system/users",
                          {"username":"evil","name":"evil"},cookie=limited)["status"],403)
        self.assertEqual(self.request("POST","/api/system/roles",{"name":"Bad","code":"bad"},
                          origin="http://evil.test")["status"],403)

    def test_password_rotation_revokes_old_sessions(self):
        self.login()
        first = "LongTemporaryPassword00001!"
        second = "LongTemporaryPassword00002!"
        third = "LongTemporaryPassword00003!"
        created = self.request("POST", "/api/system/users", {"username":"alice", "name":"Alice", "password":first})
        self.assertEqual(created["status"], 201)
        uid = created["body"]["data"]["id"]
        signed = self.request("POST", "/api/system/auth/login", {"username":"alice", "password":first})
        cookie = signed["headers"]["Set-Cookie"].split(";")[0]
        changed = self.request("POST", "/api/system/auth/change-password",
                               {"currentPassword":first, "newPassword":second}, cookie=cookie)
        self.assertEqual(changed["status"], 200)
        rotated = changed["headers"]["Set-Cookie"].split(";")[0]
        self.assertEqual(self.request("GET", "/api/system/auth/me", cookie=cookie)["status"], 401)
        self.assertEqual(self.request("GET", "/api/system/auth/me", cookie=rotated)["status"], 200)
        reset = self.request("POST", "/api/system/users/" + uid + "/reset-password", {"newPassword":third})
        self.assertEqual(reset["status"], 200)
        self.assertEqual(self.request("GET", "/api/system/auth/me", cookie=rotated)["status"], 401)
        self.assertEqual(self.request("POST", "/api/system/auth/login", {"username":"alice", "password":third})["status"], 200)
        self.assertEqual(self.request("POST", "/api/system/roles", {"name":"Invalid role","code":"superadmin"})["status"], 403)

    def test_parameters_reject_secrets_and_hierarchy_cycle(self):
        self.login()
        self.assertEqual(self.request("POST","/api/system/parameters",{
          "name":"API Key", "key":"my_api_key", "value":"secret"})["status"],422)
        param=self.request("POST","/api/system/parameters",{"name":"刷新周期","key":"refresh_rate","value":"30"})
        self.assertEqual(param["status"],201,param)
        parent=self.request("POST","/api/system/menus",{"name":"父菜单","path":"/parent"})
        child=self.request("POST","/api/system/menus",{"name":"子菜单","parentId":parent["body"]["data"]["id"]})
        rid=parent["body"]["data"]["id"]
        self.assertEqual(self.request("PATCH",f"/api/system/menus/{rid}",
             {"parentId":child["body"]["data"]["id"]})["status"],422)


if __name__=="__main__":
    unittest.main()
