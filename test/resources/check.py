#!/usr/bin/env python3
"""Real CLI + backend + webview checks; run after setup.sh / setup.ps1."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
import tarfile

# Windows' locale codepage can't write the Cyrillic fixture names.
if os.name == 'nt' and not sys.flags.utf8_mode:
    sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))

TOOL = Path(__file__).resolve().parents[2]
TJS = TOOL / 'bin' / ('tjs.exe' if os.name == 'nt' else 'tjs')
MAC = sys.platform == 'darwin'
DATA = bytes([0, 1, 127, 128, 255, 10])
REL = 'data/данные with spaces/nested/bytes.bin'


def run(argv, cwd, ok=True):
    p = subprocess.run([str(x) for x in argv], cwd=cwd, capture_output=True, text=True, timeout=180)
    if ok and p.returncode:
        raise AssertionError(p.stdout + p.stderr)
    return p


def cli(project, command, ok=True):
    return run([TJS, 'run', TOOL / 'cli.js', command], project, ok)


def same_path(a, b):
    # Windows paths mix separators (tjs.exePath + '/resources'), as the other
    # app.paths entries do there; compare them as Windows does.
    if a is None or b is None or os.name != 'nt':
        return a == b
    return os.path.normcase(os.path.normpath(a)) == os.path.normcase(os.path.normpath(b))


# A launcher still exiting holds its .exe; don't let that mask the real error.
with tempfile.TemporaryDirectory(prefix='tinyjs-resources-', ignore_cleanup_errors=True) as tmp:
    base = Path(tmp).resolve()
    project = base / 'project with spaces ü'
    project.mkdir()
    (project / 'src/frontend').mkdir(parents=True)
    res = project / 'resources'
    data = res / REL
    data.parent.mkdir(parents=True)
    data.write_bytes(DATA)
    (res / 'data/empty directory').mkdir()
    (res / 'data/dictionary.json').write_text('{"hello":"world"}')
    report = base / 'report.json'
    config = {'name': 'resource-check', 'title': 'Resource Check', 'version': '1.0.0',
              'id': 'org.tinyjs.resourcecheck.' + str(os.getpid())}

    def write_config(resources='absent', **extra):
        cfg = dict(config)
        if resources != 'absent':
            cfg['resources'] = resources
        cfg.update(extra)
        (project / 'tinyjs.json').write_text(json.dumps(cfg))

    (project / 'src/main.js').write_text('''let app;
let result;
export async function init(a) {
  app = a;
  try {
    const root = app.paths.resources;
    result = { root, bytes: root === null ? null : Array.from(await tjs.readFile(root + '/' + REL)) };
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
'''.replace('REL', json.dumps(REL)).replace('REPORT', json.dumps(str(report))))
    (project / 'src/frontend/index.html').write_text('''<!doctype html><title>Resource check</title>
<script>
(async () => {
  while (!window.tiny) await new Promise(r => setTimeout(r, 20));
  const paths = await tiny.app.paths();
  await tiny.api.call('inspect', { root: paths.resources });
})();
</script>''')

    def launch(argv, cwd, expected):
        report.unlink(missing_ok=True)
        # Cleanup targets only our own process group, including dev's child.
        kwargs = {'start_new_session': True} if os.name != 'nt' else {}
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
                assert result['bytes'] == (None if expected is None else list(DATA)), result
                # The dev supervisor and its child are cleaned up together below.
                if 'dev' not in argv:
                    assert p.wait(timeout=10) == 0, log.read_text()
            finally:
                if p.poll() is None:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)
                    else:
                        import signal
                        os.killpg(p.pid, signal.SIGTERM)
                    p.wait(timeout=10)
        print('PASS runtime:', 'dev' if 'dev' in argv else Path(argv[0]).name, expected)

    p = cli(project, 'build', ok=False)
    assert p.returncode and 'no tinyjs.json' in p.stdout, p.stdout

    # Invalid config/path cases fail BEFORE staging and name the bad resource.
    invalid = [None, 'data', {}, [42], [''], ['.'], ['./'], ['/etc/passwd'],
               ['C:/Windows/file'], ['C:relative'], [r'\\server\share\file'],
               [r'\Windows\file'], ['../outside'], ['data/../../outside'],
               ['missing'], ['data/dictionary.json/child', 'data/dictionary.json']]
    for value in invalid:
        write_config(value)
        for command in ['build', 'dev']:
            p = cli(project, command, ok=False)
            assert p.returncode != 0 and 'tinyjs.json' in p.stdout and 'resource' in p.stdout, (value, p.stdout, p.stderr)
    # A list needs the folder it lists from.
    shutil.move(str(res), base / 'parked')
    write_config(['data'])
    for command in ['build', 'dev']:
        p = cli(project, command, ok=False)
        assert p.returncode and 'no resources/ folder' in p.stdout, p.stdout
    shutil.move(str(base / 'parked'), res)
    print('PASS invalid config, missing paths, traversal, drive/UNC paths, no folder (dev + build)')
    try:
        (res / 'link').symlink_to(res / 'data', target_is_directory=True)
        (res / 'data/link').symlink_to(data)
        for value in [['link'], ['link/dictionary.json'], ['data/'], 'absent']:
            write_config(value)
            for command in ['dev', 'build']:
                p = cli(project, command, ok=False)
                assert p.returncode and 'symlinks are not supported' in p.stdout, p.stdout
        (res / 'data/link').unlink()
        (res / 'link').unlink()
        # resources/ itself as a symlink
        shutil.move(str(res), base / 'real-resources')
        res.symlink_to(base / 'real-resources', target_is_directory=True)
        write_config('absent')
        p = cli(project, 'build', ok=False)
        assert p.returncode and 'symlinks are not supported' in p.stdout, p.stdout
        res.unlink()
        shutil.move(str(base / 'real-resources'), res)
        print('PASS direct, parent, nested and folder symlink rejection')
    except OSError as e:
        print('SKIP symlinks:', e)

    oskey = 'macos' if MAC else 'windows' if os.name == 'nt' else 'linux'
    # Platform overrides replace the invalid common list using the existing merger.
    selected = ['./data//', REL.replace('/', chr(92)), 'data/', './data/dictionary.json']
    write_config(['missing'], **{oskey: {'resources': selected}})
    launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, str(res.resolve()))
    assert not (project / '.build/resources').exists()
    cli(project, 'build')
    assert (project / 'dist/resources/data/empty directory').is_dir()
    assert (project / 'dist/resources' / REL).read_bytes() == DATA
    assert sorted(p.relative_to(project / 'dist/resources').as_posix()
                  for p in (project / 'dist/resources').rglob('*') if p.is_file()) == sorted([REL, 'data/dictionary.json'])

    # Move the WHOLE distribution and launch it with a different cwd.
    moved = base / 'moved build ü'
    shutil.move(str(project / 'dist'), moved)
    binary = moved / ('resource-check.exe' if os.name == 'nt' else 'resource-check')
    launch([binary], base, str(moved / 'resources'))
    if MAC:
        bundle = moved / 'Resource Check.app'
        launch([bundle / 'Contents/MacOS/resource-check'], base,
               str(bundle / 'Contents/Resources/app/resources'))
        run(['codesign', '--verify', '--deep', '--strict', bundle], base)
        print('PASS relocated .app signature')

    # Two builds in the SAME output folder must remove an excluded file.
    write_config(selected)
    cli(project, 'build')
    write_config([REL])
    cli(project, 'build')
    assert not (project / 'dist/resources/data/dictionary.json').exists()
    assert (project / 'dist/resources' / REL).read_bytes() == DATA
    if MAC:
        assert not (project / 'dist/Resource Check.app/Contents/Resources/app/resources/data/dictionary.json').exists()
    cli(project, 'publish')
    archives = list((project / 'dist/publish').glob('*.zip' if MAC or os.name == 'nt' else '*.tar.gz'))
    assert len(archives) == 1, archives
    member = ('Resource Check.app/Contents/Resources/app/resources/' if MAC else 'resource-check/resources/') + REL
    if archives[0].suffix == '.zip':
        with zipfile.ZipFile(archives[0]) as z:
            # ditto writes UTF-8 names without the ZIP UTF-8 flag on macOS.
            def name(info):
                if MAC and not info.flag_bits & 0x800:
                    return info.filename.encode('cp437').decode('utf-8')
                return info.filename
            matches = [i for i in z.infolist() if name(i) == member]
            assert len(matches) == 1, [name(i) for i in z.infolist()]
            assert z.read(matches[0]) == DATA
    else:
        with tarfile.open(archives[0]) as z:
            assert z.extractfile(member).read() == DATA
    print('PASS rebuild removes stale resources; local publish archive preserves binary bytes')

    # A URL wrapper has no local frontend. Its resource root must still work.
    import http.server
    import threading
    page = (project / 'src/frontend/index.html').read_bytes()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(page)

        def log_message(self, *args):
            pass

    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            write_config([REL], url='http://127.0.0.1:' + str(server.server_port),
                         frontend={'dir': 'no-local-frontend'})
            launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, str(res.resolve()))
            cli(project, 'build')
            binary = project / 'dist' / ('resource-check.exe' if os.name == 'nt' else 'resource-check')
            launch([binary], base, str(project / 'dist/resources'))
            if MAC:
                bundle = project / 'dist/Resource Check.app'
                launch([bundle / 'Contents/MacOS/resource-check'], base,
                       str(bundle / 'Contents/Resources/app/resources'))
        finally:
            server.shutdown()
            thread.join()
    print('PASS URL wrapper without a local frontend (dev + packaged backend/frontend RPC)')

    # No list: the whole folder ships, extra top-level entries included.
    (res / 'top.txt').write_text('top')
    write_config('absent')
    launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, str(res.resolve()))
    cli(project, 'build')
    assert (project / 'dist/resources/top.txt').read_text() == 'top'
    assert (project / 'dist/resources/data/empty directory').is_dir()
    binary = project / 'dist' / ('resource-check.exe' if os.name == 'nt' else 'resource-check')
    launch([binary], base, str(project / 'dist/resources'))
    if MAC:
        bundle = project / 'dist/Resource Check.app'
        assert (bundle / 'Contents/Resources/app/resources/top.txt').read_text() == 'top'
        launch([bundle / 'Contents/MacOS/resource-check'], base,
               str(bundle / 'Contents/Resources/app/resources'))
    print('PASS no list ships the whole resources/ folder')

    # [] ships nothing; no list and no folder is the same.
    for resources in [[], 'absent']:
        if resources == 'absent':
            shutil.move(str(res), base / 'parked')
        write_config(resources)
        launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, None)
        cli(project, 'build')
        assert not (project / 'dist/resources').exists()
        binary = project / 'dist' / ('resource-check.exe' if os.name == 'nt' else 'resource-check')
        launch([binary], base, None)
        if MAC:
            bundle = project / 'dist/Resource Check.app'
            assert not (bundle / 'Contents/Resources/app/resources').exists()
            launch([bundle / 'Contents/MacOS/resource-check'], base, None)
    print('PASS absent/empty resources, ordinary builds, backend object and frontend RPC null')

print('PASS all resource checks on', sys.platform)
