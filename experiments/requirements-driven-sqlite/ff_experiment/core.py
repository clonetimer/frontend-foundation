"""Local, single-user CSV/TSV -> SQLite -> parameterized query/export core.

Prototype. No third-party packages, untrusted files and column names never enter SQL.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import sqlite3
from contextlib import closing
import uuid
from pathlib import Path
from datetime import datetime, timezone

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 60
MAX_EXPORT_ROWS = 100_000
MAX_PAGE_SIZE = 200
VALID_ENCODINGS = {"utf-8-sig", "utf-8", "gb18030"}
VALID_DELIMITERS = {"auto", ",", "\t", ";"}
NUMERIC = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")
ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")


class ValidationError(Exception):
    pass


def data_path(data_dir: Path, dataset_id: str) -> Path:
    if not isinstance(dataset_id, str) or not ID_PATTERN.fullmatch(dataset_id):
        raise ValidationError("无效的数据集标识")
    return Path(data_dir) / ("dataset_" + dataset_id + ".sqlite3")


def _safe_text(name: str) -> str:
    # Names are metadata only; SQL identifiers always internally generated c_0 etc.
    return name.strip().lstrip("\ufeff")


def _column_names(header: list[str]) -> tuple[list[str], list[str]]:
    if not header or len(header) > MAX_COLUMNS:
        raise ValidationError(f"列数应为 1 至 {MAX_COLUMNS}")
    unique, used, warnings = [], set(), []
    for i, raw in enumerate(header):
        h = _safe_text(raw)
        if not h:
            raise ValidationError(f"第 {i+1} 列表头为空")
        if len(h) > 120:
            raise ValidationError(f"第 {i+1} 列表头超过 120 字符")
        candidate, n = h, 2
        while candidate.casefold() in used:
            candidate = f"{h}_{n}"
            n += 1
        if candidate != h:
            warnings.append(f"重复列名“{h}”改为“{candidate}”")
        used.add(candidate.casefold())
        unique.append(candidate)
    return unique, warnings


def _is_numeric(values: list[str]) -> bool:
    significant = [v.strip() for v in values if v.strip()]
    if not significant:
        return False
    for v in significant:
        if not NUMERIC.fullmatch(v):
            return False
        # Keep identifiers such as 00123 as text, not numeric IDs.
        unprefixed = v.lstrip("+-")
        if re.match(r"^0\d", unprefixed):
            return False
        try:
            if not math.isfinite(float(v)):
                return False
        except ValueError:
            return False
    return True


def _detect_delimiter(text: str, option: str, filename: str) -> str:
    if option not in VALID_DELIMITERS:
        raise ValidationError("分隔符仅支持自动、逗号、Tab、分号")
    if option != "auto":
        return option
    try:
        guessed = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
        return guessed.delimiter
    except csv.Error:
        return "\t" if filename.lower().endswith(".tsv") else ","


def import_bytes(data_dir: Path, filename: str, content: bytes, encoding: str = "utf-8-sig", delimiter: str = "auto") -> dict:
    if not filename or len(filename) > 255 or not filename.lower().endswith((".csv", ".txt", ".tsv")):
        raise ValidationError("仅支持 .csv、.txt、.tsv 文件（xlsx 尚未实现）")
    if encoding not in VALID_ENCODINGS:
        raise ValidationError("编码仅支持 UTF-8、UTF-8 BOM、GB18030")
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise ValidationError("文件为空或超过 20 MB 限额")
    try:
        decoded = content.decode(encoding)
    except UnicodeDecodeError as exc:
        raise ValidationError("文件编码与选择不匹配，请选择正确编码") from exc
    if "\x00" in decoded:
        raise ValidationError("不能导入包含 NUL 字符的二进制文件")
    sep = _detect_delimiter(decoded, delimiter, filename)
    reader = csv.reader(io.StringIO(decoded, newline=""), delimiter=sep, strict=True)
    try:
        header = next(reader)
        names, warnings = _column_names(header)
        rows = []
        for n, row in enumerate(reader, start=2):
            if n > MAX_ROWS + 1:
                raise ValidationError(f"超过 {MAX_ROWS} 行上限")
            if len(row) != len(names):
                raise ValidationError(f"第 {n} 行有 {len(row)} 列，预期 {len(names)} 列；本次导入已取消")
            rows.append(row)
    except (csv.Error, StopIteration) as exc:
        raise ValidationError("CSV 格式损坏或缺少表头") from exc
    if not rows:
        raise ValidationError("只有表头，没有可导入的数据记录")
    column_types = ["number" if _is_numeric([r[i] for r in rows]) else "text" for i in range(len(names))]
    dataset_id = uuid.uuid4().hex
    dest = data_path(data_dir, dataset_id)
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    fields = [f'"c_{i}" TEXT' for i in range(len(names))]
    table_stmt = 'CREATE TABLE records (row_number INTEGER PRIMARY KEY, ' + ", ".join(fields) + ")"
    insert_stmt = 'INSERT INTO records (row_number, ' + ', '.join(f'"c_{i}"' for i in range(len(names))) + ') VALUES (' + ','.join('?' for _ in range(len(names) + 1)) + ')'
    try:
        with closing(sqlite3.connect(dest)) as conn, conn:
            conn.execute(table_stmt)
            conn.execute('CREATE TABLE dataset_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            columns = [{"id": f"c_{i}", "name": name, "type": column_types[i]} for i, name in enumerate(names)]
            meta = {
                "id": dataset_id,
                "filename": Path(filename).name,
                "imported_at": datetime.now(timezone.utc).isoformat(),
                "encoding": encoding,
                "delimiter": "TAB" if sep == "\t" else sep,
                "row_count": len(rows),
                "columns": columns,
                "warnings": warnings,
            }
            conn.executemany("INSERT INTO dataset_metadata VALUES (?, ?)", ((k, json.dumps(v, ensure_ascii=False)) for k, v in meta.items()))
            conn.executemany(insert_stmt, ((i, *row) for i, row in enumerate(rows, start=1)))
        return meta
    except Exception:
        dest.unlink(missing_ok=True)
        raise


def _open_readonly(path: Path):
    if not path.is_file():
        raise ValidationError("数据集不存在")
    return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)


def dataset_info(data_dir: Path, dataset_id: str) -> dict:
    with closing(_open_readonly(data_path(data_dir, dataset_id))) as conn:
        metadata = {row[0]: json.loads(row[1]) for row in conn.execute("SELECT key,value FROM dataset_metadata")}
    if metadata.get("id") != dataset_id or "columns" not in metadata:
        raise ValidationError("数据库元数据无效")
    return metadata


def list_datasets(data_dir: Path) -> list[dict]:
    result = []
    for path in sorted(Path(data_dir).glob("dataset_*.sqlite3")) if Path(data_dir).exists() else []:
        dataset_id = path.stem.removeprefix("dataset_")
        try:
            info = dataset_info(data_dir, dataset_id)
            result.append({"id": info["id"], "filename": info["filename"], "row_count": info["row_count"], "imported_at": info["imported_at"]})
        except (ValidationError, sqlite3.Error, KeyError, ValueError):
            continue
    return sorted(result, key=lambda x: x["imported_at"], reverse=True)


def _numeric_arg(value) -> float:
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise ValidationError("数值条件必须是数字")
    number = str(value)
    if not NUMERIC.fullmatch(number):
        raise ValidationError("无效的数值查询条件")
    parsed = float(number)
    if not math.isfinite(parsed):
        raise ValidationError("数值条件超出支持范围")
    return parsed


def _compile(info: dict, spec: dict) -> tuple[str, list]:
    if not isinstance(spec, dict):
        raise ValidationError("查询条件必须是 JSON 对象")
    columns = {c["id"]: c for c in info["columns"]}
    filters = spec.get("filters", [])
    if not isinstance(filters, list) or len(filters) > 8:
        raise ValidationError("最多同时使用八个筛选条件")
    clauses, args = [], []
    for f in filters:
        if not isinstance(f, dict) or f.get("column") not in columns:
            raise ValidationError("查询字段未在当前数据集中定义")
        key = f["column"]
        col = columns[key]
        op = f.get("operator")
        value = f.get("value")
        if not isinstance(value, (str, int, float)) or isinstance(value, bool) or len(str(value)) > 300:
            raise ValidationError("查询值必须为不超过 300 字符的文本或数字")
        field = f'"{key}"'
        if op == "eq":
            clauses.append(f"{field} = ?")
            args.append(str(value))
        elif op in {"contains", "starts_with"}:
            escaped = str(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append(f"{field} LIKE ? ESCAPE '\\' COLLATE NOCASE")
            args.append('%' + escaped + '%' if op == "contains" else escaped + '%')
        elif op in {"gt", "gte", "lt", "lte", "between"}:
            if col["type"] != "number":
                raise ValidationError(f"字段 {col['name']} 不是纯数值列，不能进行数值范围比较")
            number = _numeric_arg(value)
            expr = f'CAST({field} AS REAL)'
            if op == "between":
                end = _numeric_arg(f.get("value2"))
                if end < number:
                    raise ValidationError("区间结束值不能小于起始值")
                clauses.append(f"{field} <> '' AND {expr} >= ? AND {expr} <= ?")
                args.extend([number, end])
            else:
                relation = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[op]
                clauses.append(f"{field} <> '' AND {expr} {relation} ?")
                args.append(number)
        else:
            raise ValidationError("不支持的筛选运算符")
    where = " WHERE " + " AND ".join("(" + term + ")" for term in clauses) if clauses else ""
    return where, args


def _sort(info: dict, spec: dict) -> str:
    sort = spec.get("sort") or {}
    if not isinstance(sort, dict):
        raise ValidationError("排序规则格式错误")
    key = sort.get("column")
    if key is None or key == "":
        return " ORDER BY row_number ASC"
    columns = {c["id"]: c for c in info["columns"]}
    if key not in columns:
        raise ValidationError("排序字段不存在")
    direction = sort.get("direction", "asc")
    if direction not in {"asc", "desc"}:
        raise ValidationError("排序方向只能为 asc 或 desc")
    field = f'"{key}"'
    if columns[key]["type"] == "number":
        colsort = f'CAST(NULLIF({field}, \'\') AS REAL)'
    else:
        colsort = f"{field} COLLATE NOCASE"
    return f" ORDER BY {colsort} {direction.upper()}, row_number ASC"


def query_dataset(data_dir: Path, dataset_id: str, spec: dict) -> dict:
    info = dataset_info(data_dir, dataset_id)
    where, args = _compile(info, spec)
    ordering = _sort(info, spec)
    page = spec.get("page", 1)
    size = spec.get("page_size", 50)
    if type(page) is not int or page < 1 or page > 1_000_000:
        raise ValidationError("页码必须为正整数")
    if type(size) is not int or not (1 <= size <= MAX_PAGE_SIZE):
        raise ValidationError(f"每页至多 {MAX_PAGE_SIZE} 条")
    fields = ",".join('"' + c["id"] + '"' for c in info["columns"])
    with closing(_open_readonly(data_path(data_dir, dataset_id))) as conn:
        total = conn.execute("SELECT COUNT(*) FROM records" + where, args).fetchone()[0]
        values = conn.execute("SELECT row_number," + fields + " FROM records" + where + ordering + " LIMIT ? OFFSET ?", args + [size, (page - 1) * size]).fetchall()
    return {"dataset_id": dataset_id, "total": total, "page": page, "page_size": size, "columns": info["columns"], "rows": [{"row_number": row[0], "values": dict(zip((c["id"] for c in info["columns"]), row[1:]))} for row in values]}


def _csv_safe(value: str) -> str:
    """Protect Excel/Sheets CSV import from formula injection without altering SQLite."""
    value = value or ""
    stripped = value.lstrip(" \t\r\n")
    if (stripped.startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n"))) and not (NUMERIC.fullmatch(stripped) and _is_numeric([stripped])):
        return "'" + value
    return value


def export_csv(data_dir: Path, dataset_id: str, spec: dict) -> bytes:
    info = dataset_info(data_dir, dataset_id)
    where, args = _compile(info, spec)
    ordering = _sort(info, spec)
    fields = ",".join('"' + c["id"] + '"' for c in info["columns"])
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    with closing(_open_readonly(data_path(data_dir, dataset_id))) as conn:
        count = conn.execute("SELECT COUNT(*) FROM records" + where, args).fetchone()[0]
        if count > MAX_EXPORT_ROWS:
            raise ValidationError(f"结果超过 {MAX_EXPORT_ROWS} 行导出上限")
        writer.writerow([c["name"] for c in info["columns"]])
        for row in conn.execute("SELECT " + fields + " FROM records" + where + ordering, args):
            writer.writerow([_csv_safe(v) for v in row])
    return ("\ufeff" + out.getvalue()).encode("utf-8")
