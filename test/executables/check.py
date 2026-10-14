#!/usr/bin/env python3
"""Real CLI + backend + webview checks for executables/; run after setup.sh / setup.ps1.

The sidecar is a copy of bin/tjs (a native binary on every OS, so no compiler
is needed): the packaged backend spawns it from app.paths.executables and
reports what it printed. macOS adds signing checks (Contents/Helpers,
identifiers, entitlements, arch warnings) with cc-built fixtures; with
TINYJS_TEST_SIGN_IDENTITY set (a Developer ID) and bun on PATH it also signs
a JIT sidecar under the hardened runtime, with and without allow-jit.
"""
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time

TOOL = Path(__file__).resolve().parents[2]
TJS = TOOL / 'bin' / ('tjs.exe' if os.name == 'nt' else 'tjs')
MAC = sys.platform == 'darwin'
WIN = os.name == 'nt'
OS = 'macos' if MAC else 'windows' if WIN else 'linux'
ARCH = {'arm64': 'arm64', 'aarch64': 'arm64'}.get(platform.machine().lower(), 'x86_64')
SIDE = 'side-car.exe' if WIN else 'side-car'
IDENTITY = os.environ.get('TINYJS_TEST_SIGN_IDENTITY')
# Builds sign ad-hoc unless asked: an identity exported in the shell would
# otherwise apply to every build here (and was, unnoticed, at first).
os.environ.pop('TINYJS_SIGN_IDENTITY', None)


def run(argv, cwd, ok=True, env=None):
    p = subprocess.run([str(x) for x in argv], cwd=cwd, capture_output=True, text=True, timeout=600,
                       env=None if env is None else {**os.environ, **env})
    if ok and p.returncode:
        raise AssertionError(p.stdout + p.stderr)
    return p


def cli(project, *command, ok=True, env=None):
    return run([TJS, 'run', TOOL / 'cli.js', *command], project, ok, env)


def same_path(a, b):
    if a is None or b is None or not WIN:
        return a == b
    return os.path.normcase(os.path.normpath(a)) == os.path.normcase(os.path.normpath(b))


with tempfile.TemporaryDirectory(prefix='tinyjs-executables-', ignore_cleanup_errors=True) as tmp:
    base = Path(tmp).resolve()
    # tjs.exe's argv is ANSI (TODO-verify.md, resources): no ü on Windows.
    project = base / ('project with spaces' + ('' if WIN else ' ü'))
    (project / 'src/frontend').mkdir(parents=True)
    exe_root = project / 'executables'
    report = base / 'report.json'
    config = {'name': 'exec-check', 'title': 'Exec Check', 'version': '1.0.0',
              'id': 'org.tinyjs.execcheck.' + str(os.getpid())}

    def write_config(**extra):
        (project / 'tinyjs.json').write_text(json.dumps({**config, **extra}))

    def reset(*folders):
        shutil.rmtree(exe_root, ignore_errors=True)
        exe_root.mkdir()
        for f in folders:
            (exe_root / f).mkdir(parents=True)

    def put_sidecar(folder, name=SIDE):
        dest = exe_root / folder / name
        shutil.copyfile(TJS, dest)
        if not WIN:
            dest.chmod(0o755)
        return dest

    # The backend spawns <executables>/side-car (tjs) with a one-liner and
    # reports its stdout; the frontend reports what tiny.app.paths() says.
    (project / 'src/main.js').write_text('''let app, result;
export async function init(a) {
  app = a;
  try {
    const root = app.paths.executables;
    let out = null;
    if (root !== null) {
      const p = tjs.spawn([root + '/' + SIDE, 'eval', 'console.log("sidecar " + 6 * 7)'], { stdout: 'pipe' });
      const r = p.stdout.getReader();
      out = '';
      for (;;) { const { value, done } = await r.read(); if (done) break; out += new TextDecoder().decode(value); }
      const st = await p.wait();
      out = out.trim() + ' exit=' + st.exit_status;
    }
    result = { root, out };
  } catch (e) { result = { error: String(e) }; }
}
export const api = {
  async inspect({ root: frontendRoot }) {
    while (!result) await new Promise(r => setTimeout(r, 10));
    await tjs.writeFile(REPORT, new TextEncoder().encode(JSON.stringify({ ...result, frontendRoot })));
    setTimeout(() => app.quit(), 100);
    return true;
  }
};
'''.replace('SIDE', json.dumps(SIDE)).replace('REPORT', json.dumps(str(report))))
    (project / 'src/frontend/index.html').write_text('''<!doctype html><title>Exec check</title>
<script>
(async () => {
  while (!window.tiny) await new Promise(r => setTimeout(r, 20));
  const paths = await tiny.app.paths();
  await tiny.api.call('inspect', { root: paths.executables });
})();
</script>''')

    def launch(argv, cwd, expected):
        report.unlink(missing_ok=True)
        kwargs = {'start_new_session': True} if not WIN else {}
        log = base / 'launch.log'
        with log.open('w') as out:
            p = subprocess.Popen([str(x) for x in argv], cwd=cwd, stdout=out, stderr=out, **kwargs)
            try:
                deadline = time.monotonic() + 25
                while not report.exists() and time.monotonic() < deadline and p.poll() is None:
                    time.sleep(.1)
                assert report.exists(), log.read_text()
                result = json.loads(report.read_text())
                assert 'error' not in result, result
                assert result['root'] == result['frontendRoot'], result
                assert same_path(result['root'], expected), (result, expected)
                assert result['out'] == (None if expected is None else 'sidecar 42 exit=0'), result
                if 'dev' not in argv:
                    assert p.wait(timeout=10) == 0, log.read_text()
            finally:
                if p.poll() is None:
                    if WIN:
                        subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)
                    else:
                        import signal
                        os.killpg(p.pid, signal.SIGTERM)
                    p.wait(timeout=10)
        print('PASS runtime:', 'dev' if 'dev' in argv else Path(argv[0]).name, expected)

    dev = [TJS, 'run', TOOL / 'cli.js', 'dev']
    write_config()
    bare = project / 'dist' / ('exec-check.exe' if WIN else 'exec-check')
    bundle = project / 'dist/Exec Check.app'

    stub = TJS.read_bytes()[:64]  # passes the native-binary check, can't run
    staged = str((project / '.build/executables').resolve())
    wrong = b'MZ\x90\x00' if not WIN else b'\x7fELF\x02\x01\x01\x00'

    def fails(label, needle, commands=('dev', 'build')):
        for command in commands:
            p = cli(project, command, ok=False)
            assert p.returncode and needle in p.stdout, (label, command, p.stdout, p.stderr)

    # In an OS folder everything is meant for this OS: a wrong file fails.
    other = 'linux' if MAC else 'macos'
    cases = [
        ('text file', lambda: (reset(OS), (exe_root / OS / 'notes.txt').write_text('hi')), 'not a'),
        ('folder inside', lambda: reset(OS, OS + '/lib'), 'expected a file'),
        ('wrong-OS binary', lambda: (reset(OS), (exe_root / OS / 'x').write_bytes(wrong)), 'not a'),
    ]
    if MAC:
        cases.append(('script on macOS', lambda: (reset(OS), (exe_root / OS / 'run.sh').write_text('#!/bin/sh\necho hi\n')), 'script'))
        cases.append(('Java class', lambda: (reset(OS), (exe_root / OS / 'A.class').write_bytes(
            b'\xca\xfe\xba\xbe\x00\x00\x00\x34' + b'\x00' * 8)), 'not a'))
    for label, setup, needle in cases:
        setup()
        fails(label, needle)
    try:
        for where in ['', OS]:
            reset(OS)
            put_sidecar(OS)
            (exe_root / where / 'link').symlink_to(exe_root / OS / SIDE)
            fails('symlink in ' + (where or 'root'), 'symlinks are not supported')
        print('PASS OS-folder errors (non-binary, folder, wrong OS) and symlinks anywhere')
    except OSError as e:
        print('PASS OS-folder errors; SKIP symlink:', e)

    # No list: the root ships, minus what isn't this OS's (noted, not fatal) —
    # where every OS's binaries can sit side by side.
    reset(other, 'tools')
    put_sidecar('')
    (exe_root / 'other-os.bin').write_bytes(wrong)
    (exe_root / 'README.txt').write_text('notes')
    (exe_root / other / 'ignored').write_bytes(b'not for this OS')
    (exe_root / '.DS_Store').write_bytes(b'\0')
    launch(dev, project, staged)
    p = cli(project, 'build')
    for needle in ['other-os.bin isn', 'README.txt isn', 'tools/ isn']:
        assert needle in p.stdout, (needle, p.stdout)
    assert sorted(os.listdir(project / 'dist/executables')) == [SIDE]
    if not WIN:
        assert os.access(project / 'dist/executables' / SIDE, os.X_OK)
    moved = base / ('moved build' + ('' if WIN else ' ü'))
    shutil.move(str(project / 'dist'), moved)
    launch([moved / bare.name], base, str(moved / 'executables'))
    if MAC:
        mb = moved / bundle.name
        assert sorted(os.listdir(mb / 'Contents/Helpers')) == [SIDE]
        assert not (mb / 'Contents/Resources/app/src/executables').exists()
        launch([mb / 'Contents/MacOS/exec-check'], base, str(mb / 'Contents/Helpers'))
        run(['codesign', '--verify', '--deep', '--strict', mb], base)
        info = run(['codesign', '-dv', mb / 'Contents/Helpers' / SIDE], base).stderr
        assert 'Identifier=' + config['id'] + '.side-car' in info, info
        print('PASS relocated .app: Helpers signed with the app-scoped identifier, bundle verifies')
    shutil.move(str(moved), project / 'dist')
    print('PASS no list ships the root; other OSes\' files, data and subfolders are noted and left out')

    # The update payload carries the sidecar, still executable.
    cli(project, 'publish')
    archives = list((project / 'dist/publish').glob('*.zip' if MAC or WIN else '*.tar.gz'))
    assert len(archives) == 1, archives
    member = 'Exec Check.app/Contents/Helpers/' + SIDE if MAC else 'exec-check/executables/' + SIDE
    if archives[0].suffix == '.zip':
        import zipfile
        with zipfile.ZipFile(archives[0]) as z:
            info = z.getinfo(member)
            assert WIN or (info.external_attr >> 16) & 0o111, oct(info.external_attr >> 16)
    else:
        import tarfile
        with tarfile.open(archives[0]) as z:
            assert z.getmember(member).mode & 0o111, oct(z.getmember(member).mode)
    print('PASS publish archive carries the sidecar, executable')

    # Folder overrides by name: root < <os>/ < <os>-<arch>/. The losers are
    # stubs that can't run, so a passing spawn proves the right one shipped.
    other_arch = 'x86_64' if ARCH == 'arm64' else 'arm64'
    reset(OS, f'{OS}-{ARCH}', f'{OS}-{other_arch}')
    (exe_root / SIDE).write_bytes(stub)
    put_sidecar(OS)
    put_sidecar(OS, 'only-os' + ('.exe' if WIN else ''))
    (exe_root / f'{OS}-{other_arch}' / SIDE).write_bytes(stub)
    launch(dev, project, staged)
    shutil.copy(exe_root / OS / SIDE, exe_root / f'{OS}-{ARCH}' / SIDE)  # keeps +x
    (exe_root / OS / SIDE).write_bytes(stub)
    launch(dev, project, staged)
    cli(project, 'build')
    assert sorted(os.listdir(project / 'dist/executables')) == sorted([SIDE, 'only-os' + ('.exe' if WIN else '')])
    launch([bare], base, str(project / 'dist/executables'))
    print(f'PASS {OS}/ overrides the root and {OS}-{ARCH}/ overrides {OS}/, by file name; {OS}-{other_arch}/ ignored')

    # A list ships exactly those paths, flat; a platform block replaces it.
    reset(OS, 'tools')
    put_sidecar('tools')
    (exe_root / OS / SIDE).write_bytes(stub)
    (exe_root / 'extra').write_bytes(stub)
    write_config(executables=['missing'], **{OS: {'executables': ['./tools//', 'tools/' + SIDE]}})
    launch(dev, project, staged)
    cli(project, 'build')
    assert sorted(os.listdir(project / 'dist/executables')) == [SIDE]
    launch([bare], base, str(project / 'dist/executables'))
    if MAC:
        launch([bundle / 'Contents/MacOS/exec-check'], base, str(bundle / 'Contents/Helpers'))
    write_config(executables=['tools/' + SIDE.replace('/', chr(92))])
    cli(project, 'build')
    assert sorted(os.listdir(project / 'dist/executables')) == [SIDE]
    for value, needle in [('tools', 'must be an array'), ([42], 'non-empty path'), ([''], 'non-empty path'),
                          (['.'], 'executables/ itself'), (['/etc/hosts'], 'absolute'),
                          (['C:/x'], 'absolute'), (['../outside'], 'parent traversal'), (['missing'], 'not found'),
                          (['tools/' + SIDE, OS + '/' + SIDE], 'two files named'),
                          (['README.txt'], 'not found')]:
        write_config(executables=value)
        fails(repr(value), needle)
    (exe_root / 'notes.txt').write_text('hi')
    write_config(executables=['notes.txt'])
    fails('listed non-binary', 'not a')
    write_config(executables=[])
    launch(dev, project, None)
    cli(project, 'build')
    assert not (project / 'dist/executables').exists()
    shutil.rmtree(exe_root)
    write_config(executables=['tools'])
    fails('list without folder', 'no executables/ folder')
    reset(OS)
    put_sidecar(OS)
    write_config()
    print('PASS "executables" list: exact paths, flat, per-OS replacement, path errors, clashes, [] ships nothing')

    # A backend at the project root must not copy executables/ (or resources/,
    # assets/) into the app's own sources.
    shutil.move(str(project / 'src/main.js'), project / 'main.js')
    write_config(backend='main.js', frontend={'dir': 'src/frontend'})
    cli(project, 'build')
    if MAC:
        assert not (bundle / 'Contents/Resources/app/src/executables').exists()
    launch([bare], base, str(project / 'dist/executables'))
    shutil.move(str(project / 'main.js'), project / 'src/main.js')
    write_config()
    print('PASS root-level backend leaves executables/ out of the app sources')

    if MAC:
        cc = shutil.which('cc')
        src = base / 'h.c'
        src.write_text('#include <stdio.h>\nint main(void){puts("hi");return 0;}\n')
        reset(OS)
        put_sidecar(OS)
        other_arch = 'x86_64' if ARCH == 'arm64' else 'arm64'
        run([cc, '-arch', other_arch, '-o', exe_root / OS / 'thin', src], base)
        # Pre-signed with an entitlement: kept when the config names none.
        ent = base / 'ent.plist'
        ent.write_text('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
                       '"http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'
                       '<key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>')
        run([cc, '-o', exe_root / OS / 'presigned', src], base)
        run(['codesign', '--force', '--sign', '-', '--entitlements', ent, exe_root / OS / 'presigned'], base)
        p = cli(project, 'build')
        assert f'executables/macos/thin has no {ARCH} slice' in p.stdout, p.stdout
        ents = lambda f: run(['codesign', '-d', '--entitlements', '-', '--xml', bundle / 'Contents/Helpers' / f], base).stdout
        assert 'disable-library-validation' in ents('presigned'), ents('presigned')
        print('PASS missing-slice warning; a sidecar keeps the entitlements it arrived with')

        write_config(macos={'executableEntitlements': {'presigned': ['com.apple.security.cs.allow-jit']}})
        cli(project, 'build')
        got = ents('presigned')
        assert 'allow-jit' in got and 'disable-library-validation' not in got, got
        run(['codesign', '--verify', '--deep', '--strict', bundle], base)
        for bad in [{'nope': ['com.apple.security.cs.allow-jit']}, {'presigned': 'com.apple.x'},
                    {'presigned': ['<evil>']}, ['presigned']]:
            write_config(executableEntitlements=bad)
            p = cli(project, 'build', ok=False)
            assert p.returncode and 'executableEntitlements' in p.stdout, (bad, p.stdout)
        write_config()
        print('PASS "executableEntitlements" replaces them; bad values fail the build')

        # Developer ID: hardened runtime on every Helper; a JIT sidecar needs
        # allow-jit to survive it.
        bun = shutil.which('bun')
        if IDENTITY and bun:
            reset(OS)
            put_sidecar(OS)
            js = base / 'jit.js'
            js.write_text('let s = 0; for (let i = 0; i < 1e7; i++) s += i % 7; console.log("jit " + s);\n')
            run([bun, 'build', '--compile', js, '--outfile', exe_root / OS / 'jit'], base)
            env = {'TINYJS_SIGN_IDENTITY': IDENTITY}
            cli(project, 'build', env=env)
            info = run(['codesign', '-dv', bundle / 'Contents/Helpers/jit'], base).stderr
            assert 'flags=0x10000(runtime)' in info, info
            crashed = run([bundle / 'Contents/Helpers/jit'], base, ok=False)
            assert crashed.returncode != 0, 'a JIT sidecar ran under the hardened runtime without allow-jit'
            write_config(macos={'executableEntitlements': {'jit': [
                'com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory',
                'com.apple.security.cs.disable-executable-page-protection',
                'com.apple.security.cs.allow-dyld-environment-variables',
                'com.apple.security.cs.disable-library-validation']}})
            cli(project, 'build', env=env)
            ok = run([bundle / 'Contents/Helpers/jit'], base, ok=False)
            assert ok.returncode == 0 and ok.stdout.strip() == 'jit 29999994', (ok.stdout, ok.stderr)
            launch([bundle / 'Contents/MacOS/exec-check'], base, str(bundle / 'Contents/Helpers'))
            run(['codesign', '--verify', '--deep', '--strict', bundle], base)
            write_config()
            print('PASS Developer ID: hardened runtime on Helpers; a bun sidecar dies without allow-jit, runs with it')
        else:
            print('SKIP Developer ID / JIT sidecar (set TINYJS_TEST_SIGN_IDENTITY and install bun)')

    # No folder for this OS, or none at all: null, nothing shipped.
    for folders in [[other], []]:
        reset(*folders)
        if not folders:
            shutil.rmtree(exe_root)
        launch(dev, project, None)
        cli(project, 'build')
        assert not (project / 'dist/executables').exists()
        launch([bare], base, None)
        if MAC:
            assert not (bundle / 'Contents/Helpers').exists()
            launch([bundle / 'Contents/MacOS/exec-check'], base, None)
    print('PASS no folder for this OS / no executables/: null, nothing shipped')

print('PASS all executables checks on', sys.platform)
