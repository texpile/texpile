# TeX Live for Windows from the picked mirror into -Dir, with TeX Live's own install-tl and tlmgr: scheme-basic, then
# the list in vendor/texlive-packages.txt, no docs or sources. Stops when the mirror moved on from -Tlpdb during the
# install. Runs in Windows PowerShell 5.1 and PowerShell 7.
#   scripts/texlive/install.ps1 -Mirror <url> [-Tlpdb <line>] -Dir <folder>
# -Mirror, -Tlpdb: the lines pick-mirror.sh prints; without -Tlpdb, the database the mirror serves when it starts.
param(
	[Parameter(Mandatory)] [string]$Mirror,
	[string]$Tlpdb,
	[Parameter(Mandatory)] [string]$Dir
)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 offers TLS 1.0 first, which mirrors refuse
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
# a mirror may serve the checksum as binary, which Windows PowerShell 5.1 hands back as bytes
function Get-Text([string]$Url) {
	[Text.Encoding]::ASCII.GetString((Invoke-WebRequest $Url -UseBasicParsing).RawContentStream.ToArray()).Trim()
}
if (-not $Tlpdb) { $Tlpdb = Get-Text "$Mirror/tlpkg/texlive.tlpdb.sha512" }
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
New-Item -ItemType Directory -Force $Dir | Out-Null
$Dir = (Resolve-Path $Dir).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
New-Item -ItemType Directory $work | Out-Null

function Assert-SameRevision {
	if ((Get-Text "$Mirror/tlpkg/texlive.tlpdb.sha512") -ne $Tlpdb) {
		throw "$Mirror moved to a newer revision during the install; run it again"
	}
}

try {
	Assert-SameRevision
	Invoke-WebRequest "$Mirror/install-tl.zip" -OutFile (Join-Path $work 'install-tl.zip') -UseBasicParsing
	Expand-Archive (Join-Path $work 'install-tl.zip') -DestinationPath $work
	$installer = (Get-ChildItem $work -Directory | Select-Object -First 1).FullName
	& "$installer\install-tl-windows.bat" -no-gui -no-interaction -portable -scheme scheme-basic -no-doc-install `
		-no-src-install -texdir $Dir -repository $Mirror
	if ($LASTEXITCODE) { throw "install-tl exited with $LASTEXITCODE" }
	# an absolute path: tlmgr finds its tree from where it was run
	$tlmgr = Join-Path $Dir 'bin\windows\tlmgr.bat'
	& $tlmgr --repository $Mirror install (Get-Content (Join-Path $root 'vendor\texlive-packages.txt'))
	if ($LASTEXITCODE) { throw "tlmgr exited with $LASTEXITCODE" }
	& $tlmgr option repository (Get-Content (Join-Path $root 'vendor\texlive.json') -Raw | ConvertFrom-Json).repository
	if ($LASTEXITCODE) { throw "tlmgr exited with $LASTEXITCODE" }
	Assert-SameRevision
} finally {
	Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
