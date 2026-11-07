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

$unsigned = @(Get-ChildItem $Dir -Recurse -File -Include *.exe, *.dll | Where-Object { (Get-AuthenticodeSignature $_.FullName).Status -ne 'Valid' })
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
