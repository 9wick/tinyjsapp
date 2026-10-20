#!/usr/bin/env python3
"""Real CLI checks for extras/; run after setup.sh / setup.ps1.

Extras are files for the person downloading the app: beside the executable
in the Windows/Linux dist/ folder and publish archive, at the root of the
macOS dmg, never inside the .app or the macOS update zip. Builds only (no
window), so no graphical session is needed.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

TOOL = Path(__file__).resolve().parents[2]
TJS = TOOL / 'bin' / ('tjs.exe' if os.name == 'nt' else 'tjs')
MAC = sys.platform == 'darwin'
WIN = os.name == 'nt'
LINUX = not MAC and not WIN
OS = 'macos' if MAC else 'windows' if WIN else 'linux'
OTHER = 'linux' if MAC else 'macos'
IDENTITY = os.environ.get('TINYJS_TEST_SIGN_IDENTITY')
# Builds sign ad-hoc unless asked: an identity exported in the shell would
# otherwise apply to every build here.
os.environ.pop('TINYJS_SIGN_IDENTITY', None)
if IDENTITY:
    os.environ['TINYJS_SIGN_IDENTITY'] = IDENTITY


def run(argv, cwd, ok=True):
    p = subprocess.run([str(x) for x in argv], cwd=cwd, capture_output=True, text=True, timeout=600)
    if ok and p.returncode:
        raise AssertionError(p.stdout + p.stderr)
    return p


def cli(project, *command, ok=True):
    return run([TJS, 'run', TOOL / 'cli.js', *command], project, ok)


with tempfile.TemporaryDirectory(prefix='tinyjs-extras-', ignore_cleanup_errors=True) as tmp:
    base = Path(tmp).resolve()
    project = base / ('project with spaces' + ('' if WIN else ' ü'))
    (project / 'src/frontend').mkdir(parents=True)
    (project / 'src/main.js').write_text('export async function init() {}\n')
    (project / 'src/frontend/index.html').write_text('<!doctype html><title>Extras check</title>')
    root = project / 'extras'
    dist = project / 'dist'
    config = {'name': 'extras-check', 'title': 'Extras Check', 'version': '1.0.0',
              'id': 'org.tinyjs.extrascheck.' + str(os.getpid())}

    def write_config(**extra):
        (project / 'tinyjs.json').write_text(json.dumps({**config, **extra}))

    def layout():
        shutil.rmtree(root, ignore_errors=True)
        (root / 'docs').mkdir(parents=True)
        (root / OS).mkdir()
        (root / OTHER).mkdir()
        (root / 'README.txt').write_text('root readme')
        (root / 'LICENSE.txt').write_text('licence')
        (root / 'docs/guide.txt').write_text('guide')
        (root / 'docs/.DS_Store').write_text('junk')
        (root / '.DS_Store').write_text('junk')
        (root / OS / 'README.txt').write_text(OS + ' readme')
        (root / OTHER / 'ONLY.txt').write_text('not this OS')
        if not WIN:
            (root / 'install.sh').write_text('#!/bin/sh\necho hi\n')
            (root / 'install.sh').chmod(0o755)

    # What landed where extras go: dist/ (Windows/Linux) or the dmg root.
    def shipped_tree(where):
        out = {}
        for p in sorted(where.rglob('*')):
            rel = p.relative_to(where).as_posix()
            out[rel] = p
        return out

    def with_dmg(fn):
        (dmg,) = dist.glob('*.dmg')
        mnt = base / 'mnt'
        mnt.mkdir(exist_ok=True)
        run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-mountpoint', mnt, dmg], project)
        try:
            return fn(mnt)
        finally:
            run(['hdiutil', 'detach', mnt, '-quiet'], project, ok=False)

    APP_FILES = {'Extras Check.app', 'Applications'} if MAC else \
        {'extras-check.exe', 'launcher.exe'} if WIN else {'extras-check', 'launcher', 'icon.png'}

    def extras_in(where):
        """Top-level names in where, minus the app's own, and their files."""
        tree = shipped_tree(where)
        return {k: v for k, v in tree.items()
                if k.split('/')[0] not in APP_FILES and not k.startswith(('Extras Check.app/', 'publish', 'bin'))}

    def build_and_look(*flags):
        p = cli(project, 'build', *flags)
        if MAC:
            if '--dmg' in flags:
                return p, with_dmg(lambda m: {k: (v.read_text() if v.is_file() else None, v.stat().st_mode)
                                              for k, v in extras_in(m).items()})
            return p, None
        return p, {k: (v.read_text() if v.is_file() else None, v.stat().st_mode)
                   for k, v in extras_in(dist).items()}

    write_config()

    # No folder: nothing shipped, nothing said.
    p, got = build_and_look('--dmg') if MAC else build_and_look()
    assert '==> extras' not in p.stdout, p.stdout
    assert got == {}, got
    print('PASS no extras/: nothing ships')

    # No list: the top level, overridden by name from extras/<os>/; folders
    # whole; junk and other OSes' folders left out.
    layout()
    want = {'README.txt': OS + ' readme', 'LICENSE.txt': 'licence', 'docs': None, 'docs/guide.txt': 'guide'}
    if not WIN:
        want['install.sh'] = '#!/bin/sh\necho hi\n'
    p, got = build_and_look('--dmg') if MAC else build_and_look()
    assert {k: v[0] for k, v in got.items()} == want, got
    assert '==> extras: LICENSE.txt, README.txt, docs' in p.stdout, p.stdout
    if not WIN:
        assert got['install.sh'][1] & 0o111, oct(got['install.sh'][1])
    print('PASS no list: root + ' + OS + '/ override, folder whole, junk + ' + OTHER + '/ skipped'
          + ('' if WIN else ', exec bit kept'))

    if MAC:
        # The .app in the dmg, beside the extras, still verifies, signed as asked.
        def signature(mnt):
            app = mnt / 'Extras Check.app'
            run(['codesign', '--verify', '--deep', '--strict', app], project)
            return run(['codesign', '-dvv', app], project).stderr
        sig = with_dmg(signature)
        if IDENTITY:
            assert 'Authority=' + IDENTITY in sig, sig
        else:
            assert 'Signature=adhoc' in sig, sig
        print('PASS macOS: the .app in the dmg verifies (' + ('signed: ' + IDENTITY if IDENTITY else 'ad-hoc') + ')')

        # Never inside the .app, and a build without --dmg says where they went.
        app = dist / 'Extras Check.app'
        assert not any(p.name in ('README.txt', 'LICENSE.txt', 'guide.txt') for p in app.rglob('*'))
        assert not (dist / 'README.txt').exists()
        p, _ = build_and_look()
        assert 'ship in the dmg only' in p.stdout, p.stdout
        print('PASS macOS: not in the .app or dist/; a build without --dmg notes it')

    # publish: Windows/Linux archives carry them in the app folder; the macOS
    # update zip doesn't.
    cli(project, 'publish')
    (archive,) = (dist / 'publish').glob('*.zip' if MAC or WIN else '*.tar.gz')
    if LINUX:
        import tarfile
        with tarfile.open(archive) as z:
            members = {m.name: m for m in z.getmembers()}
        assert 'extras-check/README.txt' in members and 'extras-check/docs/guide.txt' in members, list(members)
        assert members['extras-check/install.sh'].mode & 0o111, oct(members['extras-check/install.sh'].mode)
        assert not any('ONLY.txt' in n or '.DS_Store' in n for n in members), list(members)
    else:
        import zipfile
        with zipfile.ZipFile(archive) as z:
            names = z.namelist()
        if WIN:
            assert 'extras-check/README.txt' in names and 'extras-check/docs/guide.txt' in names, names
        else:
            assert not any(n.endswith(('README.txt', 'LICENSE.txt', 'guide.txt')) for n in names), names
    print('PASS publish archive ' + ('leaves them out (macOS update zip)' if MAC else 'carries them in the app folder'))

    if MAC:
        # notarize rebuilds the dmg through the same path; check makeDmg alone
        # by rebuilding with --dmg after a change.
        (root / 'LICENSE.txt').write_text('licence v2')
        _, got = build_and_look('--dmg')
        assert got['LICENSE.txt'][0] == 'licence v2', got
        print('PASS dmg rebuilt with the current extras')

    # Lists: exactly these, each by its own name; an OS block replaces the
    # root list; [] ships nothing.
    lists = [
        ({'extras': [OS + '/README.txt', 'docs/']}, {'README.txt', 'docs', 'docs/guide.txt'}),
        ({'extras': ['README.txt'], OS: {'extras': ['LICENSE.txt']}}, {'LICENSE.txt'}),
        ({'extras': [OTHER + '\\ONLY.txt']}, {'ONLY.txt'}),
        ({'extras': []}, set()),
    ]
    for extra, names in lists:
        write_config(**extra)
        _, got = build_and_look('--dmg') if MAC else build_and_look()
        assert set(got) == names, (extra, got)
    print('PASS lists: by name from any folder, per-OS block replaces, [] ships none')

    # Errors fail the build before it compiles anything.
    def fails(label, needle, setup):
        layout()
        write_config()
        setup()
        p = cli(project, 'build', ok=False)
        assert p.returncode and needle in p.stdout, (label, p.stdout, p.stderr)
        assert '==> compiling backend' not in p.stdout, (label, p.stdout)

    taken = 'applications' if MAC else 'LAUNCHER.exe' if WIN else 'launcher'
    cases = [
        ('name the build uses', 'the build already writes', lambda: (root / taken).write_text('x')),
        ('name the build uses, via the OS layer', 'the build already writes',
         lambda: (root / OS / ('extras check.APP' if MAC else 'Resources' if WIN else 'resources')).mkdir()),
        ('list clash', 'two extras named README.txt',
         lambda: write_config(extras=['README.txt', OS + '/README.txt'])),
        ('parent traversal', 'parent traversal', lambda: write_config(extras=['../tinyjs.json'])),
        ('absolute path', 'absolute', lambda: write_config(extras=['/etc/hosts'])),
        ('missing', 'not found', lambda: write_config(extras=['nope.txt'])),
        ('extras/ itself', 'that is extras/ itself', lambda: write_config(extras=['./'])),
        ('not an array', 'must be an array', lambda: write_config(extras='README.txt')),
        ('list, no folder', 'no extras/ folder',
         lambda: (shutil.rmtree(root), write_config(extras=['README.txt']))),
    ]
    if LINUX:
        cases.append(('case clash', 'two extras named', lambda: (root / 'readme.TXT').write_text('x')))
    for label, needle, setup in cases:
        fails(label, needle, setup)
    try:
        fails('symlink at the top', 'symlinks are not supported',
              lambda: (root / 'link.txt').symlink_to(root / 'README.txt'))
        fails('symlink inside a folder', 'symlinks are not supported',
              lambda: (root / 'docs/link.txt').symlink_to(root / 'README.txt'))
        print('PASS errors (taken names, clashes, bad paths, symlinks) fail before compiling')
    except OSError as e:
        print('PASS errors fail before compiling; SKIP symlink:', e)

    # A README put in assets/ gets pointed at extras/.
    layout()
    write_config()
    (project / 'assets').mkdir(exist_ok=True)
    (project / 'assets/README.md').write_text('hi')
    p = cli(project, 'build')
    assert 'assets/README.md' in p.stdout and 'go in extras/' in p.stdout, p.stdout
    print('PASS assets/README.md is pointed at extras/')

print('PASS extras')
