"""One-command local deployment: build React, register pages, bootstrap admin, serve same-origin."""
from __future__ import annotations
import argparse
import getpass
import threading
import os
from pathlib import Path
import shutil
import subprocess
import sys
import webbrowser
from wsgiref.simple_server import make_server
from typing import Callable

from db import create_admin, database, initialize
from maintenance import server_lock, sync_pages
from server import ManagementApp

def launch(root: Path, db_path: Path, port: int, skip_build: bool, check_only: bool, no_browser: bool,
           *, credentials: tuple[str, str] | None = None, stop_event: threading.Event | None = None,
           on_ready: Callable[[str], None] | None = None,
           on_progress: Callable[[str], None] | None = None):
    def progress(message: str) -> None:
        if on_progress is not None:
            on_progress(message)
        else:
            print(message, flush=True)
    if not (root / "package.json").is_file() or not (root / "management" / "page-permissions.json").is_file():
        raise RuntimeError("Run this launcher inside an exported FF React ZIP project")
    if not 1 <= port <= 65535:
        raise ValueError("Port must be between 1 and 65535")
    build_dir = root / "dist"
    if not skip_build:
        if not shutil.which("npm"):
            raise RuntimeError("Node.js/npm is required for first build (Node 24 recommended)")
        # If node_modules are already provisioned, avoid unexpected network calls.
        if not (root / "node_modules").is_dir():
            progress("首次部署：安装前端依赖…")
            result = subprocess.run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"],
                                    cwd=root, check=True, shell=os.name=="nt",
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
            progress("依赖安装完成")
        progress("构建前端页面…")
        result = subprocess.run(["npm", "run", "build"], cwd=root, check=True, shell=os.name=="nt",
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
        progress("前端构建完成")
    if not (build_dir / "index.html").is_file():
        raise RuntimeError("Frontend dist/index.html missing; remove --skip-build or run npm run build")
    if check_only:
        print("Deployment checks passed; no database or accounts changed.")
        return
    initialize(str(db_path))
    added = sync_pages(db_path, root / "management" / "page-permissions.json")
    progress("已注册 " + str(added) + " 项新业务页面权限")
    with database(str(db_path)) as conn:
        initialized = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
    if not initialized:
        progress("首次启动：正在初始化管理员账号")
        if credentials is not None:
            username, password = credentials
        else:
            username = input("Administrator username [admin]: ").strip() or "admin"
            password = getpass.getpass("New administrator password (12–200 characters): ")
            repeated = getpass.getpass("Confirm password: ")
            if password != repeated:
                raise RuntimeError("Passwords differ; no administrator created")
        create_admin(str(db_path), username, password)
    if os.environ.get("FF_MANAGEMENT_ALLOWED_ORIGIN", "").startswith("https://"):
        raise RuntimeError("Local one-click mode is HTTP loopback only. Use HTTPS reverse proxy deployment separately.")
    url = "http://127.0.0.1:" + str(port)
    app = ManagementApp(str(db_path), str(build_dir))
    with server_lock(db_path):
        with make_server("127.0.0.1",port,app) as http:
            progress("FF 应用已启动：" + url)
            if on_ready is not None:
                on_ready(url)
            if not no_browser:
                webbrowser.open(url)
            if stop_event is None:
                http.serve_forever()
            else:
                http.timeout = 0.4
                while not stop_event.is_set():
                    http.handle_request()
                progress("服务已安全停止")

def main() -> None:
    parser=argparse.ArgumentParser(description="FF single-command local deployment")
    parser.add_argument("--db", default="management/instance/management.sqlite3")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--skip-build", action="store_true", help="Use an existing validated dist directory")
    parser.add_argument("--check-only", action="store_true", help="Validate packaging without writing to database")
    parser.add_argument("--no-browser", action="store_true")
    args=parser.parse_args()
    project_root=Path(__file__).resolve().parent.parent
    db_path=(project_root / args.db).resolve()
    try:
        launch(project_root,db_path,args.port,args.skip_build,args.check_only,args.no_browser)
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        raise SystemExit("Deployment failed: "+str(exc)) from exc

if __name__=="__main__":
    main()
