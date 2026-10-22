"""SQLite schema and security primitives for the standalone FF management service.

No dependency on Foundation internals. The service is deliberately single-tenant
and is not a replacement for a distributed enterprise identity provider.
"""
from __future__ import annotations
import hashlib
import hmac
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

KDF_ROUNDS = 480_000
SESSION_SECONDS = 8 * 3600
ENTITY_FIELDS = {
    "users": ("username", "name", "department", "status"),
    "roles": ("name", "code", "sort", "status"),
    "menus": ("name", "parentId", "path", "permission", "sort", "status"),
    "dictionaries": ("name", "code", "value", "status"),
    "parameters": ("name", "key", "value"),
}
DEFAULT_MENUS = [
    ("system-users", "人员管理", "system:users:read", "/system/users", 1),
    ("system-roles", "角色管理", "system:roles:read", "/system/roles", 2),
    ("system-menus", "菜单管理", "system:menus:read", "/system/menus", 3),
    ("system-operation-logs", "操作日志", "system:logs:read", "/system/operation-logs", 4),
    ("system-login-logs", "登录日志", "system:logs:read", "/system/login-logs", 5),
    ("system-dictionaries", "字典管理", "system:dictionaries:read", "/system/dictionaries", 6),
    ("system-parameters", "参数设置", "system:parameters:read", "/system/parameters", 7),
]

def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def hash_password(value: str) -> str:
    if len(value) < 12 or len(value) > 200:
        raise ValueError("Password must be 12–200 characters.")
    salt = os.urandom(24)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf8"), salt, KDF_ROUNDS)
    return "pbkdf2_sha256$%d$%s$%s" % (KDF_ROUNDS, salt.hex(), digest.hex())

def verify_password(value: str, encoded: str) -> bool:
    try:
        method, rounds, salt, digest = encoded.split("$")
        if method != "pbkdf2_sha256" or int(rounds) != KDF_ROUNDS:
            return False
        result = hashlib.pbkdf2_hmac("sha256", value.encode("utf8"),
                                     bytes.fromhex(salt), KDF_ROUNDS)
        return hmac.compare_digest(result, bytes.fromhex(digest))
    except (ValueError, TypeError, OverflowError):
        return False

def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("ascii")).hexdigest()

def issue_token() -> str:
    return secrets.token_urlsafe(48)

def etag(revision: int) -> str:
    return '"rev-%d"' % revision

@contextmanager
def database(path: str):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def initialize(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with database(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL, department TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'enabled'
            CHECK(status IN ('enabled','disabled')),
          revision INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
          sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'enabled'
            CHECK(status IN ('enabled','disabled')),
          builtin INTEGER NOT NULL DEFAULT 0,
          revision INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS menus (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, parentId TEXT NOT NULL DEFAULT '',
          path TEXT NOT NULL DEFAULT '', permission TEXT NOT NULL DEFAULT '',
          sort INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'enabled'
            CHECK(status IN ('enabled','disabled')),
          revision INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dictionaries (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'enabled'
            CHECK(status IN ('enabled','disabled')),
          revision INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS parameters (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS role_users (
          role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY(role_id,user_id)
        );
        CREATE TABLE IF NOT EXISTS role_menus (
          role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          menu_id TEXT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
          PRIMARY KEY(role_id,menu_id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
          username TEXT NOT NULL, at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL,
          result TEXT NOT NULL, createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL, ip TEXT NOT NULL, result TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(username, at);
        """)
        now = utcnow()
        db.execute("INSERT OR IGNORE INTO roles(id,name,code,sort,status,builtin,revision,createdAt,updatedAt) "
                   "VALUES('role-root','超级管理员','superadmin',0,'enabled',1,1,?,?)", (now, now))
        db.executemany("INSERT OR IGNORE INTO menus(id,name,permission,path,sort,createdAt,updatedAt) "
                       "VALUES(?,?,?,?,?,?,?)",
                       [(a,b,c,d,e,now,now) for a,b,c,d,e in DEFAULT_MENUS])

def create_admin(path: str, username: str, password: str) -> str:
    if not username.isascii() or not (3 <= len(username) <= 48) or not username.replace("_", "").isalnum():
        raise ValueError("Username must contain 3–48 ASCII letters, digits or underscores.")
    encoded = hash_password(password)
    uid = "u-" + secrets.token_hex(12)
    with database(path) as db:
        if db.execute("SELECT 1 FROM users").fetchone():
            raise ValueError("An account already exists. Bootstrap is only allowed once.")
        now = utcnow()
        db.execute("INSERT INTO users(id,username,name,department,password_hash,status,createdAt,updatedAt) "
                   "VALUES(?,?,?,?,?,'enabled',?,?)",
                   (uid,username,username,"",encoded,now,now))
        db.execute("INSERT INTO role_users(role_id,user_id) VALUES('role-root',?)", (uid,))
    return uid
