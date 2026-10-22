#!/usr/bin/env python3
"""Fail when cli.js or the runtime reads a top-level tinyjs.json key the
schema doesn't describe: python3 test/config-schema/coverage.py

Standard library only, so it runs without the jsonschema venv check.py needs.
Nested keys (chrome.*, frontend.*, ...) are NOT covered: those blocks are read
through local aliases or handed whole to the runtime and launchers, where a
scan can't follow them. Add a new nested key to the schema by hand.
"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
# Computed by cli.js onto cfg, never written by users.
INTERNAL = {'executablesStaged', 'helpBookAnyOS'}

schema = json.loads((ROOT / 'docs/public/schema/tinyjs.schema.json').read_text(encoding='utf-8'))
described = set(schema['$defs']['settings']['properties'])

read = {}
for path in [ROOT / 'cli.js', *sorted((ROOT / 'runtime').glob('*.js'))]:
    for key in re.findall(r'\bcfg\??\.([A-Za-z_]\w*)', path.read_text(encoding='utf-8')):
        read.setdefault(key, path.relative_to(ROOT).as_posix())

missing = sorted(set(read) - described - INTERNAL)
assert not missing, 'add to docs/public/schema/tinyjs.schema.json: ' + ', '.join(
    f'{key} (read in {read[key]})' for key in missing)
print(f'PASS {len(set(read) - INTERNAL)} top-level config keys read by the code are all in the schema')
