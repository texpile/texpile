# The installed tree as -Out\texlive-windows.zip, the folder itself at the top of the archive. Made with the tar in
# System32, the one the app unpacks with: it reads zip, and xz only on some Windows builds.
#   scripts/texlive/pack.ps1 -Dir <folder> -Out <folder>
param(
	[Parameter(Mandatory)] [string]$Dir,
	[Parameter(Mandatory)] [string]$Out
)
$ErrorActionPreference = 'Stop'
$Dir = (Resolve-Path $Dir).Path.TrimEnd('\')
New-Item -ItemType Directory -Force $Out | Out-Null
$archive = Join-Path (Resolve-Path $Out).Path 'texlive-windows.zip'
# tlmgr's copy of the mirror's package database; it fetches a fresh one on its next run
Get-ChildItem (Join-Path $Dir 'tlpkg') -Filter 'texlive.tlpdb.main.*' | Remove-Item
& "$env:SystemRoot\System32\tar.exe" -a -cf $archive -C (Split-Path -Parent $Dir) (Split-Path -Leaf $Dir)
if ($LASTEXITCODE) { throw "tar exited with $LASTEXITCODE" }
Get-Item $archive | Format-List Name, Length
