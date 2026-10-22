"""FF local desktop wizard: deploy, stop, backup and offline restore without a terminal.

Tkinter is imported only inside open_wizard(), so backend tests and headless
servers do not need a display or Tk installation.
"""
from __future__ import annotations
import os
import queue
import shutil
import sqlite3
import sys
import threading
import time
import webbrowser
from pathlib import Path

from db import database
from launch import launch
from maintenance import restore, snapshot

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE = ROOT / "management" / "instance" / "management.sqlite3"

def environment_checks(root: Path) -> list[tuple[str, bool, str]]:
    """Nonmutating deployment checks; no network calls or shell commands."""
    checks = [
        ("Python 3.11+", sys.version_info >= (3, 11), sys.version.split()[0]),
        ("前端项目", (root / "package.json").is_file(), "package.json"),
        ("页面权限配置", (root / "management" / "page-permissions.json").is_file(), "page-permissions.json"),
    ]
    has_dist = (root / "dist" / "index.html").is_file()
    checks.append(("前端构建工具", has_dist or bool(shutil.which("npm")),
                   "现有构建" if has_dist else "需要 Node.js/npm"))
    return checks

def account_exists(path: Path) -> bool:
    """Never initialize a database merely to inspect its state."""
    if not path.is_file():
        return False
    with database(str(path)) as conn:
        row = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone()
        return row is not None

def validate_bootstrap(username: str, password: str, confirm: str) -> tuple[str, str]:
    username = username.strip() or "admin"
    if not username.isascii() or not (3 <= len(username) <= 48) or not username.replace("_", "").isalnum():
        raise ValueError("管理员账号应为 3–48 位 ASCII 字母、数字或下划线。")
    if len(password) < 12 or len(password) > 200:
        raise ValueError("管理员密码至少 12 个字符，最多 200 个字符。")
    if password != confirm:
        raise ValueError("两次输入的密码不一致。")
    return username, password

def open_wizard(root_path: Path = ROOT, db_path: Path | None = None) -> None:
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox, simpledialog

    root_path = root_path.resolve()
    db_path = (db_path or root_path / "management" / "instance" / "management.sqlite3").resolve()
    window = tk.Tk()
    window.title("FF 应用部署与数据维护")
    window.geometry("760x615")
    window.minsize(690, 540)
    bus: queue.Queue[tuple[str, object]] = queue.Queue()
    stop_signal = threading.Event()
    service_thread: threading.Thread | None = None
    job_thread: threading.Thread | None = None
    running = False
    starting = False
    closing = False
    local_url = "http://127.0.0.1:8765"
    port = 8765

    status = tk.StringVar(value="尚未启动应用")
    environment = tk.StringVar(value="")
    account_name = tk.StringVar(value="admin")
    account_pass = tk.StringVar()
    account_confirm = tk.StringVar()
    rebuild = tk.BooleanVar(value=False)
    destination_label = tk.StringVar(value=str(db_path))
    notebook = ttk.Notebook(window)
    notebook.pack(fill="both", expand=True, padx=16, pady=12)
    deploy_tab = ttk.Frame(notebook, padding=16)
    data_tab = ttk.Frame(notebook, padding=16)
    notebook.add(deploy_tab, text="一键部署与启动")
    notebook.add(data_tab, text="数据库备份与恢复")

    ttk.Label(deploy_tab, text="FF 应用部署向导", font=("", 16, "bold")).pack(anchor="w", pady=(0, 8))
    ttk.Label(deploy_tab, text="首次使用：填写管理员账号 → 点击启动。再次使用：直接启动。",
              wraplength=680).pack(anchor="w")
    ttk.Label(deploy_tab, textvariable=environment, wraplength=660, foreground="#245d43").pack(anchor="w", pady=10)
    account_box = ttk.LabelFrame(deploy_tab, text="首次部署：创建管理员（已有账号时无需填写）", padding=12)
    account_box.pack(fill="x", pady=8)
    fields = [("管理员账号", account_name, ""), ("新密码（至少12位）", account_pass, "*"),
              ("确认新密码", account_confirm, "*")]
    entries = []
    for i, (caption, value, mask) in enumerate(fields):
        ttk.Label(account_box, text=caption).grid(row=i, column=0, padx=(0, 10), pady=5, sticky="e")
        field = ttk.Entry(account_box, textvariable=value, width=40, show=mask)
        field.grid(row=i, column=1, pady=5, sticky="we")
        entries.append(field)
    account_box.columnconfigure(1, weight=1)
    ttk.Checkbutton(deploy_tab, text="重新安装/构建前端（若已有构建则默认复用）",
                    variable=rebuild).pack(anchor="w", pady=10)
    controls = ttk.Frame(deploy_tab)
    controls.pack(fill="x", pady=8)
    check_btn = ttk.Button(controls, text="检查运行环境")
    start_btn = ttk.Button(controls, text="启动应用")
    stop_btn = ttk.Button(controls, text="停止应用")
    browser_btn = ttk.Button(controls, text="打开应用页面")
    for button in [check_btn, start_btn, stop_btn, browser_btn]:
        button.pack(side="left", padx=(0, 10))
    ttk.Label(deploy_tab, textvariable=status, wraplength=640).pack(anchor="w", pady=8)
    messages = tk.Text(deploy_tab, height=9, state="disabled", wrap="word")
    messages.pack(fill="both", expand=True)
    ttk.Label(deploy_tab, text="仅限本机使用。公网部署仍需 HTTPS 网关与正式运维配置。",
              foreground="#665c36").pack(anchor="w", pady=8)

    ttk.Label(data_tab, text="SQLite 数据维护", font=("", 16, "bold")).pack(anchor="w", pady=(0, 12))
    ttk.Label(data_tab, textvariable=destination_label, wraplength=650).pack(anchor="w", pady=5)
    ttk.Label(data_tab, text="备份可以在应用运行时执行；生成独立 SQLite 一致性快照。",
              wraplength=650).pack(anchor="w", pady=8)
    backup_btn = ttk.Button(data_tab, text="选择位置并备份")
    backup_btn.pack(anchor="w", pady=7)
    ttk.Separator(data_tab).pack(fill="x", pady=16)
    ttk.Label(data_tab, text="恢复会覆盖现有管理数据、撤销全部登录会话，并自动保留恢复前快照。",
              wraplength=650).pack(anchor="w", pady=8)
    ttk.Label(data_tab, text="必须先停止应用；程序拒绝恢复正在使用中的数据库。",
              foreground="#9f2b2b").pack(anchor="w", pady=6)
    restore_btn = ttk.Button(data_tab, text="选择文件并恢复数据库")
    restore_btn.pack(anchor="w", pady=8)
    ttk.Label(data_tab, text="备份包含账号密码哈希等敏感数据，请存放于受访问控制保护的位置。",
              wraplength=650).pack(anchor="w", pady=10)
    ttk.Button(data_tab, text="返回启动页面", command=lambda: notebook.select(deploy_tab)).pack(anchor="w", pady=6)

    def log(message: str) -> None:
        messages.configure(state="normal")
        messages.insert("end", message + "\n")
        messages.see("end")
        messages.configure(state="disabled")

    def refresh() -> None:
        busy = bool(job_thread and job_thread.is_alive())
        check_btn.configure(state="disabled" if busy or starting else "normal")
        start_btn.configure(state="disabled" if busy or running or starting or closing else "normal")
        stop_btn.configure(state="normal" if (running or starting) and not closing else "disabled")
        browser_btn.configure(state="normal" if running else "disabled")
        backup_btn.configure(state="normal" if db_path.is_file() and not busy and not starting else "disabled")
        restore_btn.configure(state="normal" if db_path.is_file() and not busy and not running and not starting and not closing else "disabled")
        for entry in entries:
            entry.configure(state="disabled" if running or starting or busy else "normal")

    def inspect() -> None:
        checks = environment_checks(root_path)
        environment.set("环境检查：" + "　".join(("✓ " if ok else "✕ ") + title for title, ok, _ in checks))
        for title, ok, info in checks:
            log(("通过：" if ok else "缺失：") + title + " — " + info)
        try:
            known = account_exists(db_path)
        except sqlite3.DatabaseError:
            known = False
            log("已有数据库无法正常读取，请先处理数据库文件。")
        account_box.configure(text="管理员已初始化（无需重复创建）" if known else "首次部署：创建管理员")
        refresh()

    def begin_job(label: str, job, *, success: str | None = None) -> None:
        nonlocal job_thread
        if job_thread and job_thread.is_alive():
            messagebox.showwarning("当前有任务", "当前数据维护操作尚未完成。")
            return
        status.set(label)
        def work():
            try:
                result = job()
                bus.put(("job_done", (success or "操作完成", result)))
            except Exception as exc:
                bus.put(("job_error", str(exc)))
        job_thread = threading.Thread(target=work, name="ff-maintenance", daemon=True)
        job_thread.start()
        refresh()

    def start() -> None:
        nonlocal service_thread, running, starting
        if starting or running or (job_thread and job_thread.is_alive()):
            return
        failed = [name for name, ok, _ in environment_checks(root_path) if not ok]
        if failed:
            messagebox.showerror("缺少运行环境", "请先安装或补齐：" + "、".join(failed))
            return
        try:
            existing = account_exists(db_path)
            credentials = None if existing else validate_bootstrap(
                account_name.get(), account_pass.get(), account_confirm.get())
        except (ValueError, sqlite3.DatabaseError) as exc:
            messagebox.showerror("无法启动", str(exc))
            return
        # Clear Tk-held secrets as soon as the operation has been handed off.
        account_pass.set("")
        account_confirm.set("")
        starting = True
        stop_signal.clear()
        status.set("正在准备应用和初始化数据库…")
        def work():
            try:
                launch(root_path, db_path, port, (root_path / "dist" / "index.html").is_file() and not rebuild.get(),
                       False, True, credentials=credentials, stop_event=stop_signal,
                       on_ready=lambda url: bus.put(("ready", url)),
                       on_progress=lambda text: bus.put(("progress", text)))
            except Exception as exc:
                bus.put(("service_error", str(exc)))
            finally:
                bus.put(("stopped", None))
        service_thread = threading.Thread(target=work, name="ff-application", daemon=True)
        service_thread.start()
        log("正在启动；部署过程不会保存或回显管理员密码。")
        refresh()

    def stop() -> None:
        if service_thread and service_thread.is_alive():
            status.set("正在停止应用…")
            stop_signal.set()
            refresh()

    def save_backup() -> None:
        if not db_path.is_file():
            messagebox.showerror("数据库不存在", "请先初始化应用。")
            return
        target = filedialog.asksaveasfilename(title="选择安全备份保存位置",
            defaultextension=".sqlite3", filetypes=[("SQLite 数据库", "*.sqlite3"), ("所有文件", "*.*")],
            initialfile=time.strftime("ff-management-%Y%m%d-%H%M%S.sqlite3"))
        if target:
            begin_job("正在备份数据库…", lambda: snapshot(db_path, Path(target)), success="备份成功")

    def recover() -> None:
        if running or starting or (service_thread and service_thread.is_alive()):
            messagebox.showwarning("必须先停机", "请先点击“停止应用”，确保服务完全退出后再恢复。")
            return
        file = filedialog.askopenfilename(title="选择要恢复的 SQLite 备份",
            filetypes=[("SQLite 数据库", "*.sqlite3 *.db"), ("所有文件", "*.*")])
        if not file:
            return
        if not messagebox.askyesno("高风险操作：恢复数据库",
                                  "备份来源：\n" + str(Path(file).resolve()) +
                                  "\n\n这将替换当前管理数据库并强制所有用户重新登录；恢复前会保留原数据库。确认继续？"):
            return
        confirmation = simpledialog.askstring("二次确认", "请输入「恢复」以确认覆盖现有数据：", parent=window)
        if confirmation != "恢复":
            return
        begin_job("正在校验备份并安全恢复…",
                  lambda: restore(Path(file), db_path, confirmed=True), success="恢复成功（恢复前快照已保存）")

    def pump() -> None:
        nonlocal running, starting, closing
        try:
            while True:
                kind, value = bus.get_nowait()
                if kind == "progress":
                    status.set(str(value)); log(str(value))
                elif kind == "ready":
                    running = True; starting = False
                    status.set("应用运行中：" + str(value))
                    log("应用可用：" + str(value))
                    if not closing:
                        webbrowser.open(str(value))
                elif kind == "service_error":
                    running = False; starting = False
                    status.set("启动或运行失败")
                    log("服务错误：" + str(value))
                    if not closing:
                        messagebox.showerror("应用未能启动", str(value))
                elif kind == "stopped":
                    running = False; starting = False
                    status.set("应用已停止")
                    log("应用已停止。")
                elif kind == "job_done":
                    title, result = value
                    status.set(str(title))
                    log(str(title) + "：" + str(result))
                    messagebox.showinfo(str(title), str(title) + "\n文件：" + str(result))
                elif kind == "job_error":
                    status.set("维护操作失败")
                    log("维护失败：" + str(value))
                    messagebox.showerror("操作未完成", str(value))
                refresh()
        except queue.Empty:
            pass
        if closing and not starting and not running and not (service_thread and service_thread.is_alive()) and not (job_thread and job_thread.is_alive()):
            window.destroy()
            return
        window.after(160, pump)

    def close() -> None:
        nonlocal closing
        if job_thread and job_thread.is_alive():
            messagebox.showwarning("任务进行中", "数据库维护尚未完成，请勿强行退出。")
            return
        if service_thread and service_thread.is_alive():
            if not messagebox.askyesno("退出部署向导", "将先停止本地应用服务，确认退出？"):
                return
            closing = True
            stop()
            status.set("正在安全退出…")
            refresh()
        else:
            window.destroy()

    check_btn.configure(command=inspect)
    start_btn.configure(command=start)
    stop_btn.configure(command=stop)
    browser_btn.configure(command=lambda: webbrowser.open(local_url))
    backup_btn.configure(command=save_backup)
    restore_btn.configure(command=recover)
    window.protocol("WM_DELETE_WINDOW", close)
    inspect()
    window.after(160, pump)
    window.mainloop()

if __name__ == "__main__":
    try:
        open_wizard()
    except ImportError as exc:
        raise SystemExit("图形向导需要 Python 的 Tkinter 桌面组件。请安装 Tkinter 或使用 start.bat。") from exc
