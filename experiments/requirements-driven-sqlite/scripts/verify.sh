#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '[1/4] Baseline Python/HTTP/SQLite tests'
( cd ff_experiment && python -m unittest discover -s tests -v )
echo '[2/4] FF adapter and Studio design tests'
python -m unittest discover -s tests -v
echo '[3/4] Real SQLite and common-query comparison'
python run_comparison.py
echo '[4/4] JavaScript syntax; NOT a full React/Vite build'
node --check ff_experiment/static/app.js
node --check scripts/check_export.js
node --check scripts/ff_import_export.js
echo 'Experiment isolated verification PASS'
