"""Local database maintenance. Backup may run online; restore requires a stopped server."""
from __future__ import annotations
import argparse
import contextlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

RE_PAGE = re.compile(r"^[a-z][a-z0-9-]{0,35}$")

def verify(conn: sqlite3.Connection) -> None:
    result = conn.execute("PRAGMA integrity_check").fetchone()
    if not result or result[0] != "ok":
        raise ValueError("SQLite integrity_check failed")
    required = {"users", "roles", "menus", "sessions", "role_users", "role_menus"}
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not required <= tables:
        raise ValueError("Not an FF management database")

def snapshot(source: Path, destination: Path) -> Path:
    if not source.is_file():
        raise FileNotFoundError("Management database does not exist")
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError("Backup destination must be a new, different file")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name("." + destination.name + ".partial")
    if temporary.exists():
        raise ValueError("Partial backup already exists; inspect it before retrying")
    try:
        with sqlite3.connect(str(source)) as src, sqlite3.connect(str(temporary)) as out:
            verify(src)
            src.backup(out)
            verify(out)
        os.replace(temporary, destination)
        return destination
    finally:
        if temporary.exists():
            temporary.unlink()

@contextlib.contextmanager
def server_lock(path: Path):
    """Portable nonblocking exclusive lock; service holds it for its lifetime."""
    lock_file = path.with_suffix(path.suffix + ".service.lock")
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_file, "a+b") as handle:
        handle.seek(0)
        handle.write(b"0")
        handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError("Management service is running, or a restore is already in progress") from exc
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

def restore(source: Path, destination: Path, confirmed: bool = False) -> Path:
    if not confirmed:
        raise ValueError("Restore requires explicit --yes-restore confirmation")
    if source.resolve() == destination.resolve():
        raise ValueError("Source and destination must be different")
    if not destination.is_file():
        raise ValueError("Restore requires an existing initialized database")
    # The process-level lock must also be held by the WSGI server.
    with server_lock(destination):
        with sqlite3.connect(str(source)) as src:
            verify(src)
        checkpoint = destination.with_name(destination.name + ".pre-restore-" + str(int(time.time_ns())) + ".sqlite3")
        snapshot(destination, checkpoint)
        try:
            with sqlite3.connect(str(source)) as src, sqlite3.connect(str(destination)) as target:
                target.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                src.backup(target)
                target.execute("DELETE FROM sessions")  # No historical login cookie remains valid.
                target.execute("DELETE FROM login_attempts")
                target.commit()
                verify(target)
        except Exception:
            with sqlite3.connect(str(checkpoint)) as before, sqlite3.connect(str(destination)) as target:
                before.backup(target)
            raise
        return checkpoint

def sync_pages(path: Path, manifest: Path) -> int:
    data = json.loads(manifest.read_text(encoding="utf8"))
    if not isinstance(data, dict) or set(data) != {"pages"} or not isinstance(data["pages"], list):
        raise ValueError("Manifest must contain exactly a pages array")
    pages = data["pages"]
    if len(pages) > 100:
        raise ValueError("More than 100 pages")
    seen: set[str] = set()
    normalized: list[tuple[str, str, str]] = []
    for item in pages:
        if not isinstance(item, dict) or set(item) != {"id", "title"}:
            raise ValueError("Invalid page entry")
        pid, title = item["id"], item["title"]
        if not isinstance(pid, str) or not RE_PAGE.fullmatch(pid) or pid.startswith("system-") or pid in seen:
            raise ValueError("Page IDs must be unique, lowercase and non-system")
        if not isinstance(title, str) or not title.strip() or len(title) > 100:
            raise ValueError("Invalid title")
        seen.add(pid)
        normalized.append((pid, title, "#/" + pid))
    with sqlite3.connect(str(path)) as db:
        verify(db)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        count = 0
        for pid, title, route in normalized:
            # Never edit an existing grant, label, status, or human-modified menu.
            cur = db.execute("INSERT OR IGNORE INTO menus(id,name,parentId,path,permission,sort,status,revision,createdAt,updatedAt) "
                             "VALUES(?,?,?,?,?,?,'enabled',1,?,?)",
                             ("page-" + pid, title, "", route, "page:" + pid + ":view", 100, now, now))
            count += cur.rowcount
        db.commit()
        return count

def main() -> None:
    parser = argparse.ArgumentParser(description="FF safe SQLite backup / offline restore / page import")
    parser.add_argument("command", choices=["backup", "restore", "sync-pages"])
    parser.add_argument("--db", default=os.environ.get("FF_MANAGEMENT_DB", "management/instance/management.sqlite3"))
    parser.add_argument("--file", required=True, help="Backup destination, source, or page-manifest JSON")
    parser.add_argument("--yes-restore", action="store_true")
    args = parser.parse_args()
    database = Path(args.db).resolve()
    path = Path(args.file).resolve()
    try:
        if args.command == "backup":
            print("Consistent SQLite backup:", snapshot(database, path))
        elif args.command == "restore":
            print("Restore completed; previous database retained at:", restore(path, database, args.yes_restore))
            print("All sessions invalidated; restart the service and sign in again.")
        else:
            print("New page permissions registered:", sync_pages(database, path))
    except (OSError, sqlite3.Error, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        raise SystemExit("Management maintenance failed: " + str(exc)) from exc

if __name__ == "__main__":
    main()
