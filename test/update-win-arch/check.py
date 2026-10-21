#!/usr/bin/env python3
"""Which Windows download an app picks from a per-arch "win" block (#82).

Simulates Windows on a macOS/Linux host: update.js reads OS=Windows_NT and
the PROCESSOR_* variables, and a non-PE tjs falls back to them for the
app's own CPU. On real Windows the exe's PE header decides that instead,
so this runs only off Windows; there, check by hand (TODO-verify.md).
"""
import json
import os
from pathlib import Path
import subprocess
import sys

TOOL = Path(__file__).resolve().parents[2]
if os.name == 'nt':
    print('SKIP: simulates Windows; run on macOS or Linux')
    sys.exit(0)

FLAT = {'url': 'https://h/x64-old.zip', 'sha256': 'a' * 64}
X64 = {'url': 'https://h/x64.zip', 'sha256': 'b' * 64}
ARM = {'url': 'https://h/arm64.zip', 'sha256': 'c' * 64}
both = {'version': '2.0.0', 'win': {**X64, 'x86_64': X64, 'arm64': ARM}}
legacy = {'version': '2.0.0', 'win': FLAT}
arm_only = {'version': '2.0.0', 'win': {'arm64': ARM}}

x64_app = {'PROCESSOR_ARCHITECTURE': 'AMD64', 'PROCESSOR_IDENTIFIER': 'Intel64 Family 6'}
arm_app = {'PROCESSOR_ARCHITECTURE': 'ARM64', 'PROCESSOR_IDENTIFIER': 'ARMv8 (64-bit) Family 8'}
x64_on_arm_ident = {'PROCESSOR_ARCHITECTURE': 'AMD64', 'PROCESSOR_IDENTIFIER': 'ARMv8 (64-bit) Family 8'}
x64_on_arm_w6432 = {'PROCESSOR_ARCHITECTURE': 'AMD64', 'PROCESSOR_ARCHITEW6432': 'ARM64'}

cases = [
    ('x64 app, legacy manifest', x64_app, legacy, FLAT['url']),
    ('x64 app, per-arch manifest', x64_app, both, X64['url']),
    ('arm64 app, per-arch manifest', arm_app, both, ARM['url']),
    ('x64 app on ARM64 (PROCESSOR_IDENTIFIER) moves to arm64', x64_on_arm_ident, both, ARM['url']),
    ('x64 app on ARM64 (PROCESSOR_ARCHITEW6432) moves to arm64', x64_on_arm_w6432, both, ARM['url']),
    ('x64 app on ARM64, legacy manifest stays x64', x64_on_arm_ident, legacy, FLAT['url']),
    ('arm64 app never takes an x64-only manifest', arm_app, legacy, None),
    ('x64 app on x64, arm64-only manifest', x64_app, arm_only, None),
]
failed = 0
for name, env_extra, manifest, want in cases:
    env = {k: v for k, v in os.environ.items() if not k.startswith('PROCESSOR_')}
    env.update(env_extra, OS='Windows_NT')
    p = subprocess.run([str(TOOL / 'bin/tjs'), 'run', str(TOOL / 'test/update-win-arch/pick.js'), json.dumps(manifest)],
                       env=env, text=True, capture_output=True, timeout=60)
    try:
        got = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        print('FAIL', name, p.stdout + p.stderr)
        failed += 1
        continue
    ok = got['url'] == want and got['available'] == (want is not None)
    print('PASS' if ok else 'FAIL', name, '' if ok else got)
    failed += not ok
sys.exit(1 if failed else 0)
