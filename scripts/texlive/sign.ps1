# Signs the Windows programs TeX Live leaves unsigned in -Dir with Azure Trusted Signing, as Texpile LLC, and checks
# each signature and its timestamp after. Microsoft's runtime DLLs come signed and keep their own signature. Runs in
# Windows PowerShell 5.1 and PowerShell 7.
#   scripts/texlive/sign.ps1 -Dir <folder> [-DryRun]
# Signing reads AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, SIGN_ENDPOINT, SIGN_ACCOUNT and SIGN_PROFILE.
# -DryRun lists the programs and checks that every catalog line resolves the way the module reads it, without signing
# and without the credentials.
param(
	[Parameter(Mandatory)] [string]$Dir,
	[switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$Dir = (Resolve-Path $Dir).Path.TrimEnd('\')

if (-not $DryRun) {
	if (-not (Get-Module -ListAvailable -Name TrustedSigning | Where-Object { $_.Version -ge [version]'0.5.0' })) {
		if (Get-Command Install-PSResource -ErrorAction SilentlyContinue) {
			Install-PSResource -Name TrustedSigning -Version '[0.5.0,)' -Repository PSGallery -TrustRepository -Scope CurrentUser
		} else {
			Install-Module -Name TrustedSigning -MinimumVersion 0.5.0 -Repository PSGallery -Scope CurrentUser -Force
		}
	}
	Import-Module TrustedSigning -MinimumVersion 0.5.0
}

# signtool signs a PE file only; TeX Live's dviout carries an older kind of .exe (GRAPHIC\PS\gssub.exe)
function Test-PortableExecutable([string]$Path) {
	$stream = [IO.File]::OpenRead($Path)
	try {
		$reader = New-Object IO.BinaryReader($stream)
		if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5A4D) { return $false }
		$stream.Position = 0x3C
		$offset = $reader.ReadInt32()
		if ($offset -lt 0 -or $offset + 4 -gt $stream.Length) { return $false }
		$stream.Position = $offset
		return $reader.ReadUInt32() -eq 0x00004550
	} finally {
		$stream.Dispose()
	}
}

$candidates = @(Get-ChildItem $Dir -Recurse -File -Include *.exe, *.dll | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' })
$unsigned = @($candidates | Where-Object { Test-PortableExecutable $_.FullName })
foreach ($file in $candidates | Where-Object { $unsigned -notcontains $_ }) { Write-Host "not a PE file, left as it is: $($file.FullName.Substring($Dir.Length + 1))" }
if (-not $unsigned.Count) { throw 'found no program to sign' }
Write-Host "$($unsigned.Count) programs to sign"

# the module joins the catalog's own folder with each of its lines, so a catalog sits in -Dir and names the programs
# relative to it. A call takes a batch, which keeps signtool's command line short
$batch = 100
for ($i = 0; $i -lt $unsigned.Count; $i += $batch) {
	$files = $unsigned[$i..([Math]::Min($i + $batch, $unsigned.Count) - 1)]
	$catalog = Join-Path $Dir "unsigned-$i.txt"
	$files | ForEach-Object { $_.FullName.Substring($Dir.Length + 1) } | Set-Content $catalog
	try {
		foreach ($line in Get-Content $catalog) { Resolve-Path (Join-Path (Split-Path -Parent $catalog) $line) | Out-Null }
		if ($DryRun) {
			Get-Content $catalog | ForEach-Object { Write-Host "  $_" }
			continue
		}
		# the timestamp keeps the signatures valid once the three-day certificate lapses
		Invoke-TrustedSigning -Endpoint $env:SIGN_ENDPOINT -CodeSigningAccountName $env:SIGN_ACCOUNT `
			-CertificateProfileName $env:SIGN_PROFILE -FilesCatalog $catalog -FileDigest SHA256 `
			-TimestampRfc3161 'http://timestamp.acs.microsoft.com' -TimestampDigest SHA256
	} finally {
		Remove-Item $catalog
	}
}
if ($DryRun) {
	Write-Host "every catalog line resolves; nothing was signed"
	return
}

foreach ($file in $unsigned) {
	$signature = Get-AuthenticodeSignature $file.FullName
	if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw "$($file.FullName): $($signature.Status)" }
}
Write-Host "signed $($unsigned.Count) programs"
