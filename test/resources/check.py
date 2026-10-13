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

TOOL = Path(__file__).resolve().parents[2]
TJS = TOOL / 'bin' / ('tjs.exe' if os.name == 'nt' else 'tjs')
MAC = sys.platform == 'darwin'
DATA = bytes([0, 1, 127, 128, 255, 10])
REL = 'assets/данные with spaces/nested/bytes.bin'


def run(argv, cwd, ok=True):
    p = subprocess.run([str(x) for x in argv], cwd=cwd, capture_output=True, text=True, timeout=180)
    if ok and p.returncode:
        raise AssertionError(p.stdout + p.stderr)
    return p


def cli(project, command, ok=True):
    return run([TJS, 'run', TOOL / 'cli.js', command], project, ok)


with tempfile.TemporaryDirectory(prefix='tinyjs-resources-') as tmp:
    base = Path(tmp).resolve()
    project = base / 'project with spaces ü'
    project.mkdir()
    (project / 'src/frontend').mkdir(parents=True)
    data = project / REL
    data.parent.mkdir(parents=True)
    data.write_bytes(DATA)
    (project / 'assets/empty directory').mkdir()
    (project / 'assets/dictionary.json').write_text('{"hello":"world"}')
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
                assert result['root'] == result['frontendRoot'] == expected, result
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
    invalid = [None, 'assets', {}, [42], [''], ['.'], ['./'], ['/etc/passwd'],
               ['C:/Windows/file'], ['C:relative'], [r'\\server\share\file'],
               [r'\Windows\file'], ['../outside'], ['assets/../../outside'],
               ['.build'], ['dist/x'], ['.git'], ['node_modules/x'], ['missing'],
               ['assets/dictionary.json/child', 'assets/dictionary.json']]
    for value in invalid:
        write_config(value)
        for command in ['build', 'dev']:
            p = cli(project, command, ok=False)
            assert p.returncode != 0 and 'tinyjs.json' in p.stdout and 'resource' in p.stdout, (value, p.stdout, p.stderr)
    print('PASS invalid config, missing paths, traversal, reserved roots, drive/UNC paths (dev + build)')
    try:
        (project / 'link').symlink_to(project / 'assets', target_is_directory=True)
        (project / 'assets/link').symlink_to(data)
        for value in [['link'], ['link/dictionary.json'], ['assets/']]:
            write_config(value)
            for command in ['dev', 'build']:
                p = cli(project, command, ok=False)
                assert p.returncode and 'symlinks are not supported' in p.stdout, p.stdout
        (project / 'assets/link').unlink()
        print('PASS direct, parent and nested symlink rejection')
    except OSError as e:
        print('SKIP symlinks:', e)

    oskey = 'macos' if MAC else 'windows' if os.name == 'nt' else 'linux'
    # Platform overrides replace the invalid common list using the existing merger.
    selected = ['./assets//', REL.replace('/', chr(92)), 'assets/', './assets/dictionary.json']
    write_config(['missing'], **{oskey: {'resources': selected}})
    launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, str(project.resolve()))
    assert not (project / '.build/resources').exists()
    cli(project, 'build')
    assert (project / 'dist/resources/assets/empty directory').is_dir()
    assert (project / 'dist/resources' / REL).read_bytes() == DATA
    assert sorted(p.relative_to(project / 'dist/resources').as_posix()
                  for p in (project / 'dist/resources').rglob('*') if p.is_file()) == sorted([REL, 'assets/dictionary.json'])

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
    assert not (project / 'dist/resources/assets/dictionary.json').exists()
    assert (project / 'dist/resources' / REL).read_bytes() == DATA
    if MAC:
        assert not (project / 'dist/Resource Check.app/Contents/Resources/app/resources/assets/dictionary.json').exists()
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
            launch([TJS, 'run', TOOL / 'cli.js', 'dev'], project, str(project))
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

    for resources in ['absent', []]:
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
