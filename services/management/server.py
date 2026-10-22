"""Dependency-free single-instance WSGI server for FF's built-in management API."""
from __future__ import annotations
import argparse
import getpass
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from email.message import Message
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlsplit
from wsgiref.simple_server import make_server

from db import (ENTITY_FIELDS, SESSION_SECONDS, create_admin, database, etag,
                hash_password, initialize, issue_token, token_hash, utcnow,
                verify_password)

BASE = "/api/system"
RESOURCE = re.compile(r"^/(users|roles|menus|dictionaries|parameters)(?:/([A-Za-z0-9-]{1,60}))?(?:/(users|permissions))?$")
SAFE_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_:-]{0,79}$")
PERMISSIONS = {
    "users": "system:users:read", "roles": "system:roles:read",
    "menus": "system:menus:read", "dictionaries": "system:dictionaries:read",
    "parameters": "system:parameters:read",
}
SENSITIVE = re.compile(r"(password|secret|token|private|credential|api[_-]?key)", re.I)

class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status

def rows(db, sql: str, args: tuple = ()) -> list[dict]:
    return [dict(row) for row in db.execute(sql, args).fetchall()]

def safe_json(environ) -> dict:
    if not environ.get("CONTENT_TYPE", "").split(";")[0].lower() == "application/json":
        raise ApiError(415, "Content-Type must be application/json")
    try:
        size = int(environ.get("CONTENT_LENGTH", "0"))
    except ValueError:
        raise ApiError(400, "Invalid Content-Length")
    if size < 1 or size > 16_384:
        raise ApiError(413, "JSON body must be 1–16384 bytes")
    try:
        value = json.loads(environ["wsgi.input"].read(size))
    except (ValueError, UnicodeDecodeError):
        raise ApiError(400, "Invalid JSON body")
    if not isinstance(value, dict):
        raise ApiError(400, "JSON object expected")
    return value

def origin_ok(environ) -> bool:
    origin = environ.get("HTTP_ORIGIN", "").rstrip("/")
    allowed = os.environ.get("FF_MANAGEMENT_ALLOWED_ORIGIN", "").rstrip("/")
    if allowed:
        return origin == allowed
    host = environ.get("HTTP_HOST", "")
    # In development only; a production reverse proxy MUST configure an exact origin.
    if not re.fullmatch(r"(?:localhost|127\.0\.0\.1)(?::\d{1,5})?", host, re.I):
        return False
    return origin == "http://" + host

def cookie_token(environ) -> str:
    cookie = SimpleCookie()
    try:
        cookie.load(environ.get("HTTP_COOKIE", ""))
        item = cookie.get("ff_session")
        return item.value if item is not None else ""
    except Exception:
        return ""

def public_user(user: dict) -> dict:
    return {field: value for field, value in user.items() if field not in ("password_hash", "builtin")}

def bump(db, table: str, row_id: str) -> None:
    db.execute(f"UPDATE {table} SET revision=revision+1, updatedAt=? WHERE id=?",
               (utcnow(), row_id))

def validate_entity(table: str, data: dict, creating: bool = False) -> dict:
    allowed = set(ENTITY_FIELDS[table])
    values = {}
    for key, value in data.items():
        if key not in allowed and not (table == "users" and creating and key == "password"):
            raise ApiError(422, "Unsupported field: " + str(key)[:40])
        if not isinstance(value, (str, int)) or isinstance(value, bool):
            raise ApiError(422, "Scalar fields only")
        if isinstance(value, str) and len(value) > 240:
            raise ApiError(422, "Field exceeds 240 characters")
        values[key] = value
    for field in ("name",):
        if field in values and (not isinstance(values[field], str) or not values[field].strip()):
            raise ApiError(422, field + " is required")
    if "status" in values and values["status"] not in ("enabled", "disabled"):
        raise ApiError(422, "Unsupported status")
    if "sort" in values:
        if isinstance(values["sort"], str) and re.fullmatch(r"\d{1,5}", values["sort"]):
            values["sort"] = int(values["sort"])
        if not isinstance(values["sort"], int) or not 0 <= values["sort"] <= 99999:
            raise ApiError(422, "Invalid sort value")
    for field in ("username", "code", "key", "permission"):
        if field in values and values[field] and (
            not isinstance(values[field], str) or not SAFE_NAME.fullmatch(values[field])):
            raise ApiError(422, "Invalid " + field)
    if table == "parameters" and "key" in values and SENSITIVE.search(values["key"]):
        raise ApiError(422, "Secrets must not be stored in system parameters")
    if table == "users" and creating:
        if "password" not in values:
            raise ApiError(422, "New user requires a password")
        try:
            values["password_hash"] = hash_password(str(values.pop("password")))
        except ValueError as exc:
            raise ApiError(422, str(exc)) from exc
    return values

class ManagementApp:
    def __init__(self, db_path: str):
        self.db_path = db_path
        initialize(db_path)

    def __call__(self, environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path = urlsplit(environ.get("PATH_INFO", "")).path
        headers: list[tuple[str, str]] = []
        status = 200
        try:
            if path == "/healthz" and method == "GET":
                output = {"status": "ok"}
            elif not path.startswith(BASE + "/"):
                raise ApiError(404, "Not found")
            else:
                route = path[len(BASE):]
                if method in ("POST", "PUT", "PATCH", "DELETE") and not origin_ok(environ):
                    raise ApiError(403, "Origin not allowed")
                with database(self.db_path) as db:
                    if route == "/auth/login" and method == "POST":
                        output, headers = self.login(db, environ)
                    else:
                        user = self.authenticate(db, environ)
                        if route == "/auth/me" and method == "GET":
                            output = {"data": {"user": public_user(user),
                                "permissions": self.permissions(db, user)}}
                        elif route == "/auth/logout" and method == "POST":
                            raw = cookie_token(environ)
                            if raw: db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(raw),))
                            headers = [("Set-Cookie", self.session_cookie("", expire=True))]
                            output = {"data": {"ok": True}}
                        else:
                            output, status = self.dispatch(db, method, route, environ, user)
        except ApiError as exc:
            status = exc.status
            output = {"error": str(exc)}
        except sqlite3.IntegrityError:
            status = 409
            output = {"error": "Duplicate value or referenced item"}
        except (ValueError, TypeError):
            status = 422
            output = {"error": "Invalid request"}
        except Exception:
            # Avoid sending SQL details, paths or secrets back to clients.
            status = 500
            output = {"error": "Internal server error"}
        body = json.dumps(output, ensure_ascii=False, separators=(",", ":")).encode("utf8")
        phrase = {200:"OK", 201:"Created", 400:"Bad Request", 401:"Unauthorized",
                  403:"Forbidden", 404:"Not Found", 405:"Method Not Allowed",
                  409:"Conflict", 412:"Precondition Failed", 413:"Content Too Large",
                  415:"Unsupported Media Type", 422:"Unprocessable Entity",
                  423:"Locked", 428:"Precondition Required", 429:"Too Many Requests",
                  500:"Internal Server Error"}.get(status,"Error")
        start_response(f"{status} {phrase}", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
            ("Referrer-Policy", "no-referrer"), ("X-Frame-Options", "DENY"),
            *headers,
        ])
        return [body]

    @staticmethod
    def session_cookie(token: str, expire: bool = False) -> str:
        secure = os.environ.get("FF_MANAGEMENT_SECURE_COOKIE", "0") == "1"
        bits = [f"ff_session={token}", "Path=/", "HttpOnly", "SameSite=Strict"]
        if secure: bits.append("Secure")
        bits.append("Max-Age=0" if expire else f"Max-Age={SESSION_SECONDS}")
        return "; ".join(bits)

    def login(self, db, environ):
        data = safe_json(environ)
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 48:
            raise ApiError(400, "Invalid credentials")
        now = int(time.time())
        db.execute("DELETE FROM login_attempts WHERE at < ?", (now - 600,))
        failures = db.execute("SELECT COUNT(*) FROM login_attempts WHERE username=?", (username,)).fetchone()[0]
        if failures >= 5:
            raise ApiError(429, "Too many login attempts")
        record = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        valid = bool(record and record["status"] == "enabled" and verify_password(password, record["password_hash"]))
        # Audit both successful and failed sign-ins; never store passwords or raw cookies.
        db.execute("INSERT INTO login_logs(username,ip,result,createdAt) VALUES(?,?,?,?)",
                   (username, environ.get("REMOTE_ADDR", "")[:64], "success" if valid else "denied", utcnow()))
        if not valid:
            db.execute("INSERT INTO login_attempts(username,at) VALUES(?,?)", (username,now))
            raise ApiError(401, "Invalid credentials")
        db.execute("DELETE FROM login_attempts WHERE username=?", (username,))
        raw = issue_token()
        db.execute("INSERT INTO sessions(token_hash,user_id,expires_at,createdAt) VALUES(?,?,?,?)",
                   (token_hash(raw), record["id"], now + SESSION_SECONDS, utcnow()))
        return {"data": {"user": public_user(dict(record))}}, [("Set-Cookie", self.session_cookie(raw))]

    def authenticate(self, db, environ) -> dict:
        raw = cookie_token(environ)
        if not raw or len(raw) > 256: raise ApiError(401, "Login required")
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
        row = db.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id "
                         "WHERE s.token_hash=? AND s.expires_at >= ? AND u.status='enabled'",
                         (token_hash(raw), int(time.time()))).fetchone()
        if row is None: raise ApiError(401, "Session expired")
        return dict(row)

    def is_root(self, db, user: dict) -> bool:
        return db.execute("SELECT 1 FROM role_users ru JOIN roles r ON r.id=ru.role_id "
                          "WHERE ru.user_id=? AND r.status='enabled' AND r.code='superadmin'",
                          (user["id"],)).fetchone() is not None

    def permissions(self, db, user: dict) -> list[str]:
        if self.is_root(db, user): return ["*"]
        return [row[0] for row in db.execute(
            "SELECT DISTINCT m.permission FROM role_users ru JOIN roles r ON r.id=ru.role_id "
            "JOIN role_menus rm ON rm.role_id=r.id JOIN menus m ON m.id=rm.menu_id "
            "WHERE ru.user_id=? AND r.status='enabled' AND m.status='enabled' "
            "AND m.permission <> ''", (user["id"],)).fetchall()]

    def require(self, db, user: dict, permission: str, write: bool = False):
        if self.is_root(db, user): return
        if write or permission not in self.permissions(db, user):
            raise ApiError(403, "Permission denied")

    def audit(self, db, user: dict, action: str, resource: str, result: str = "success"):
        db.execute("INSERT INTO operation_logs(actor,action,resource,result,createdAt) "
                   "VALUES(?,?,?,?,?)", (user["username"], action, resource, result, utcnow()))

    def list_entity(self, db, table: str, environ) -> dict:
        qs = parse_qs(environ.get("QUERY_STRING", ""), keep_blank_values=True)
        try:
            page = int(qs.get("page",["1"])[0])
            size = int(qs.get("pageSize",["10"])[0])
        except (ValueError, TypeError):
            raise ApiError(400, "Invalid pagination")
        if page < 1 or page > 100000 or size < 1 or size > 50:
            raise ApiError(400, "Pagination out of range")
        search = qs.get("search",[""])[0][:100].replace("%", "\\%").replace("_", "\\_")
        where = "WHERE name LIKE ? ESCAPE '\\'" if search else ""
        args = (f"%{search}%",) if search else ()
        total = db.execute(f"SELECT COUNT(*) FROM {table} {where}", args).fetchone()[0]
        values = rows(db, f"SELECT * FROM {table} {where} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
                      (*args,size,(page-1)*size))
        return {"data": {"items": [public_user(x) for x in values], "total": total}}

    def detail(self, db, table: str, rid: str) -> dict:
        row = db.execute(f"SELECT * FROM {table} WHERE id=?", (rid,)).fetchone()
        if not row: raise ApiError(404, "Item not found")
        record = public_user(dict(row))
        return {"data": {"item": record, **record, "etag": etag(row["revision"])}}

    def require_match(self, environ, revision: int):
        supplied = environ.get("HTTP_IF_MATCH", "")
        if not supplied: raise ApiError(428, "Strong If-Match required")
        if supplied != etag(revision): raise ApiError(412, "Record changed; refresh and retry")

    def ensure_parent(self, db, rid: str, parent: str):
        if not parent: return
        if parent == rid: raise ApiError(422, "Menu cannot be its own parent")
        visited = {rid}
        while parent:
            if parent in visited: raise ApiError(422, "Menu hierarchy cycle")
            visited.add(parent)
            row = db.execute("SELECT parentId FROM menus WHERE id=?", (parent,)).fetchone()
            if not row: raise ApiError(422, "Parent menu missing")
            parent = row["parentId"]

    def dispatch(self, db, method, route, environ, user):
        if route in ("/logs/operations", "/logs/logins"):
            if method != "GET": raise ApiError(405, "Logs are read-only")
            self.require(db, user, "system:logs:read")
            table = "operation_logs" if route.endswith("operations") else "login_logs"
            query = parse_qs(environ.get("QUERY_STRING",""))
            try: page=int(query.get("page",["1"])[0]); size=int(query.get("pageSize",["10"])[0])
            except ValueError: raise ApiError(400, "Invalid pagination")
            if not 1 <= page <= 100000 or not 1 <= size <= 50: raise ApiError(400, "Invalid pagination")
            total = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            items = rows(db, f"SELECT * FROM {table} ORDER BY id DESC LIMIT ? OFFSET ?", (size,(page-1)*size))
            return {"data":{"items":items,"total":total}}, 200
        if route == "/users/options" and method == "GET":
            self.require(db, user, "system:roles:read", write=True)
            result = rows(db, "SELECT id,name FROM users ORDER BY username LIMIT 201")
            if len(result)>200: raise ApiError(422, "Too many users for full-set assignment")
            return {"data":{"items":result}}, 200
        if route == "/menus/tree" and method == "GET":
            self.require(db, user, "system:menus:read")
            flat=rows(db, "SELECT id,name,parentId FROM menus ORDER BY sort,id LIMIT 201")
            if len(flat)>200: raise ApiError(422, "Menu tree exceeds 200 items")
            by_id={r["id"]:{"id":r["id"],"name":r["name"],"children":[]} for r in flat}
            roots=[]
            for entry in flat:
                current=by_id[entry["id"]]
                parent=entry["parentId"]
                (by_id[parent]["children"] if parent in by_id and parent != entry["id"] else roots).append(current)
            return {"data":{"items":roots}},200
        match=RESOURCE.fullmatch(route)
        if not match: raise ApiError(404, "Unknown endpoint")
        table, rid, relation=match.groups()
        if relation and (table!="roles" or not rid or relation not in ("users","permissions")):
            raise ApiError(404, "Unknown relationship")
        perm=PERMISSIONS[table]
        # Modifications to roles, memberships and menu grants are root-only.
        self.require(db,user,perm,write=method!="GET")
        if relation:
            self.require(db,user,"system:roles:read",write=True)
            role=db.execute("SELECT * FROM roles WHERE id=?",(rid,)).fetchone()
            if not role: raise ApiError(404, "Role missing")
            if role["builtin"]: raise ApiError(403, "Built-in role memberships are immutable")
            join_table, col, body_key = (("role_users","user_id","userIds") if relation=="users"
                                         else ("role_menus","menu_id","menuIds"))
            if method=="GET":
                selected=[r[0] for r in db.execute(
                    f"SELECT {col} FROM {join_table} WHERE role_id=? ORDER BY {col}",(rid,))]
                return {"data":{"ids":selected,"etag":etag(role["revision"])}},200
            if method!="PUT": raise ApiError(405,"Only GET/PUT supported")
            self.require_match(environ,role["revision"])
            payload=safe_json(environ)
            values=payload.get(body_key)
            if not isinstance(values,list) or len(values)>200 or any(
                not isinstance(v,str) or not re.fullmatch(r"[A-Za-z0-9-]{1,60}",v) for v in values) \
                or len(set(values))!=len(values):
                raise ApiError(422, "Invalid full assignment set")
            target="users" if relation=="users" else "menus"
            if values:
                matches=db.execute(f"SELECT COUNT(*) FROM {target} WHERE id IN ({','.join('?'*len(values))})",values).fetchone()[0]
                if matches!=len(values): raise ApiError(422, "Unknown target")
            db.execute(f"DELETE FROM {join_table} WHERE role_id=?", (rid,))
            db.executemany(f"INSERT INTO {join_table}(role_id,{col}) VALUES(?,?)",[(rid,v) for v in values])
            bump(db,"roles",rid);self.audit(db,user,"replace-"+relation,table+"/"+rid)
            return {"data":{"ok":True,"etag":etag(role["revision"]+1)}},200

        if method=="GET":
            return (self.detail(db,table,rid) if rid else self.list_entity(db,table,environ)),200
        if method=="POST" and not rid:
            payload=validate_entity(table,safe_json(environ),creating=True)
            if table=="users":
                # Avoid password hash field being set by callers.
                pass
            else:
                if "password_hash" in payload: raise ApiError(422,"Not allowed")
            rid="m-"+secrets.token_hex(12)
            now=utcnow()
            values={"id":rid,**payload,"createdAt":now,"updatedAt":now}
            fields=list(values)
            db.execute(f"INSERT INTO {table} ({','.join(fields)}) VALUES ({','.join(['?']*len(fields))})",
                       tuple(values.values()))
            self.audit(db,user,"create",table+"/"+rid)
            return self.detail(db,table,rid),201
        if rid and method in ("PATCH","DELETE"):
            old=db.execute(f"SELECT * FROM {table} WHERE id=?",(rid,)).fetchone()
            if not old: raise ApiError(404,"Item not found")
            if table=="roles" and old["builtin"]: raise ApiError(403,"Built-in role cannot be changed")
            if table=="users" and rid==user["id"] and method=="DELETE":
                raise ApiError(403,"Cannot delete own user")
            if method=="DELETE":
                db.execute(f"DELETE FROM {table} WHERE id=?", (rid,))
                self.audit(db,user,"delete",table+"/"+rid)
                return {"data":{"ok":True}},200
            payload=validate_entity(table,safe_json(environ))
            if not payload: raise ApiError(422,"No fields")
            if "status" in payload: self.require_match(environ,old["revision"])
            if table=="users" and rid==user["id"] and payload.get("status")=="disabled":
                raise ApiError(403,"Cannot disable own user")
            if table=="menus" and "parentId" in payload:
                self.ensure_parent(db,rid,str(payload["parentId"]))
            if table=="menus" and ("permission" in payload or "path" in payload):
                # Permission string changes are treated as privileged writes.
                self.require(db,user,perm,write=True)
            assignments=[f"{field}=?" for field in payload]
            db.execute(f"UPDATE {table} SET {','.join(assignments)}, revision=revision+1,updatedAt=? WHERE id=?",
                       (*payload.values(),utcnow(),rid))
            if table=="users" and payload.get("status")=="disabled":
                db.execute("DELETE FROM sessions WHERE user_id=?",(rid,))
            self.audit(db,user,"update",table+"/"+rid)
            return self.detail(db,table,rid),200
        raise ApiError(405, "Method not allowed")

def main():
    parser=argparse.ArgumentParser(description="FF built-in management API (single-instance SQLite)")
    parser.add_argument("command",choices=["serve","init-admin"])
    parser.add_argument("--db",default=os.environ.get("FF_MANAGEMENT_DB","services/management/instance/management.sqlite3"))
    parser.add_argument("--host",default="127.0.0.1")
    parser.add_argument("--port",type=int,default=8765)
    parser.add_argument("--username",default="admin")
    args=parser.parse_args()
    initialize(args.db)
    if args.command=="init-admin":
        one=getpass.getpass("New administrator password (>=12 characters): ")
        two=getpass.getpass("Confirm password: ")
        if one != two: raise SystemExit("Passwords do not match")
        try: create_admin(args.db,args.username,one)
        except ValueError as exc: raise SystemExit(str(exc)) from exc
        print("Administrator created; credentials were not written to source or logs.")
        return
    allowed=os.environ.get("FF_MANAGEMENT_ALLOWED_ORIGIN","")
    if args.host not in ("127.0.0.1","localhost","::1") and not allowed:
        raise SystemExit("Non-loopback binding requires FF_MANAGEMENT_ALLOWED_ORIGIN and a trusted reverse proxy")
    if allowed.startswith("https://") and os.environ.get("FF_MANAGEMENT_SECURE_COOKIE")!="1":
        raise SystemExit("HTTPS deployment requires FF_MANAGEMENT_SECURE_COOKIE=1")
    app=ManagementApp(args.db)
    print(f"FF Management API listening at {args.host}:{args.port}",flush=True)
    with make_server(args.host,args.port,app) as server:
        server.serve_forever()

if __name__=="__main__":
    main()
