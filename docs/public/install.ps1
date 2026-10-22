# tinyjs installer (Windows).
#
#   irm https://tinyjs.app/install.ps1 | iex
#
# Downloads the latest release (or $env:TINYJS_VERSION = 'vX.Y.Z') into
# %LOCALAPPDATA%\tinyjs (or $env:TINYJS_HOME) and adds it to your user PATH.
# Picks the build for this machine: x86_64, or arm64 on Windows on ARM
# (falling back to x86_64, which runs emulated, for a release without one).
# Needs the WebView2 runtime (preinstalled on Windows 11) — no git, no
# compiler. Each release ships a copy, and `tinyjs update` runs that one.
#
# For local testing: $env:TINYJS_INSTALL_ZIP = path to a release-layout zip
# skips the download + checksum and installs that file instead.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'tarwin/tinyjsapp'
$InstallDir = if ($env:TINYJS_HOME) { $env:TINYJS_HOME } else { Join-Path $env:LOCALAPPDATA 'tinyjs' }
$Version = if ($env:TINYJS_VERSION) { $env:TINYJS_VERSION } else { 'latest' }
# The machine's architecture from the registry, not this process's own
# $env:PROCESSOR_ARCHITECTURE: an x64 shell emulated on ARM64 reports AMD64.
$machineArch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment' -ErrorAction SilentlyContinue).PROCESSOR_ARCHITECTURE
$Arch = if ($machineArch -eq 'ARM64' -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x86_64' }
$Asset = "tinyjs-windows-$Arch.zip"

$tmp = Join-Path $env:TEMP "tinyjs-install-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
    if ($env:TINYJS_INSTALL_ZIP) {
        $zip = $env:TINYJS_INSTALL_ZIP
        Write-Host "==> installing from local zip: $zip"
    } else {
        if ($Version -eq 'latest') {
            # Read the tag off github.com's /releases/latest redirect
            # (-> /releases/tag/vX.Y.Z), not the REST API: unauthenticated
            # API calls are capped at 60 an hour per IP, and shared CI
            # runners hit that constantly (#51). The final URL lives in a
            # different place on PS 5.1 (HttpWebResponse) and 7
            # (HttpResponseMessage).
            $r = Invoke-WebRequest "https://github.com/$Repo/releases/latest" -Method Head -UseBasicParsing
            $final = if ($r.BaseResponse.ResponseUri) { $r.BaseResponse.ResponseUri } else { $r.BaseResponse.RequestMessage.RequestUri }
            $Version = ([string]$final).TrimEnd('/').Split('/')[-1]
            if ($Version -notmatch '^v\d') { throw 'could not determine the latest release' }
        }
        $base = "https://github.com/$Repo/releases/download/$Version"

        Write-Host "==> downloading tinyjs $Version (windows-$Arch)"
        $zip = Join-Path $tmp $Asset
        try {
            # -UseBasicParsing everywhere: without it PS 5.1 parses responses
            # via the IE engine, which prompts on first use and dies in
            # non-interactive shells.
            Invoke-WebRequest "$base/$Asset" -OutFile $zip -UseBasicParsing
        } catch {
            if ($Arch -ne 'arm64') { throw "no Windows build in release $Version (it may predate Windows support) - $_" }
            # Releases before 0.62.0 have no arm64 build; the x64 one runs
            # emulated on Windows on ARM.
            Write-Host "    (no arm64 build in $Version - installing the x86_64 one, which runs emulated)"
            $Asset = 'tinyjs-windows-x86_64.zip'
            $zip = Join-Path $tmp $Asset
            try {
                Invoke-WebRequest "$base/$Asset" -OutFile $zip -UseBasicParsing
            } catch {
                throw "no Windows build in release $Version (it may predate Windows support) - $_"
            }
        }

        Write-Host '==> verifying checksum'
        # GitHub serves this as octet-stream: PS 5.1 then returns Content as
        # a byte[] — decode it, or line matching silently fails.
        $raw = (Invoke-WebRequest "$base/checksums.txt" -UseBasicParsing).Content
        $sums = if ($raw -is [byte[]]) { [Text.Encoding]::UTF8.GetString($raw) } else { [string]$raw }
        $line = $sums -split "`n" | Where-Object { $_ -match [regex]::Escape($Asset) } | Select-Object -First 1
        if (-not $line) { throw "checksums.txt has no entry for $Asset" }
        $expected = ($line -split '\s+')[0].Trim()
        $actual = (Get-FileHash $zip -Algorithm SHA256).Hash
        if ($actual -ne $expected -and $actual -ne $expected.ToUpper()) {
            throw "checksum verification FAILED (expected $expected, got $actual)"
        }
    }

    # Extract fresh, then swap directories. The swap (not delete-in-place)
    # matters because `tinyjs update` runs this installer FROM the install
    # dir: Windows locks a running tjs.exe against deletion, but moving its
    # directory is fine.
    Write-Host "==> installing to $InstallDir"
    $fresh = "$InstallDir.new"
    $old = "$InstallDir.old"
    Remove-Item -Recurse -Force $fresh, $old -ErrorAction SilentlyContinue
    Expand-Archive $zip $fresh
    if (Test-Path $InstallDir) { Move-Item $InstallDir $old }
    Move-Item $fresh $InstallDir
    Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue  # best effort while running

    # Add to the user PATH (idempotent; same logic as setup.ps1).
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($null -eq $userPath) { $userPath = '' }
    $parts = $userPath -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') }
    if ($parts -notcontains $InstallDir.TrimEnd('\')) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $InstallDir).TrimStart(';'), 'User')
        Write-Host "==> added $InstallDir to your user PATH (open a NEW terminal)"
    }

    $v = & (Join-Path $InstallDir 'tinyjs.cmd') version
    Write-Host "==> installed: $v"
    Write-Host 'get started (in a new terminal):  tinyjs new myapp; cd myapp; tinyjs dev'
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
