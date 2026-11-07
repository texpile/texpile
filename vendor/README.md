Programs Texpile installs for the user, signed by Texpile LLC and served from
`dl.texpile.com/vendor/<tool>/<version>/`. The binaries are never committed here; each tool has a pin file
naming the upstream release and the SHA-256 of every archive taken from it.

## tinymist

`tinymist.json` pins the release. The `vendor-tinymist` workflow downloads those archives from tinymist's
GitHub release, refuses any whose hash differs from the pin, signs the Windows and macOS programs
(Trusted Signing; Developer ID and notarization), keeps the Linux archives as they are, and uploads the
lot with `SHA256SUMS` and tinymist's license. Its summary prints the hashes the app pins in
`electron/src/tinymist/tinymistRelease.ts`.

To move to a new version:

1. Wait until the release has been out for two weeks, so a bad one is likely to have been noticed.
2. Put its version and the hashes from its `sha256.sum` in `tinymist.json`.
3. Run the workflow with Publish off, check the signatures in its artifact, then run it with Publish on.
4. Paste the printed hashes and the version into `tinymistRelease.ts`.

A published version is never replaced: Texpile releases pin its hashes, and the workflow stops if the folder
already exists. Old versions stay for the releases that still ask for them.

## TeX Live

`texlive.json` pins the TeX Live year, the repository it installs from and that year's source.
`texlive-packages.txt` lists the packages installed over `scheme-basic`: those three or more papers of the arXiv
sample load, and the ones live mode and LuaTeX writers need (`package-scan/usage/texliveList.mjs` in texpile-tools
writes it). `texlive-packages-windows.txt` adds latexindent to the Windows build only, because there it is a program
of its own. Elsewhere TeX Live's latexindent is a Perl script that needs two modules TeX Live leaves out. The
`vendor-texlive` workflow picks one mirror and builds each platform there with TeX Live's own
`install-tl` and `tlmgr`, without docs or sources. It stops when the mirror moves to a newer revision during the
run. It signs the Windows programs TeX Live leaves unsigned (Trusted Signing), checks that the macOS programs carry
TeX Live's own signatures, and keeps the Linux files as built. Each build then runs live mode's gate on the fixtures.
The upload holds one archive per platform, the year's source, TeX Live's licenses and `SHA256SUMS`, under
`<year>-r<revision>`. Its summary prints the hashes the app pins in `electron/src/texlive/texliveRelease.ts`.

The bundle holds the formats. The font cache lists the system's fonts, so it is built on the writer's machine.

Each step of the workflow is a script in `scripts/texlive/`, and each runs on its own. On Windows, with a mirror's
`tlnet` URL:

```powershell
scripts\texlive\install.ps1 -Mirror https://mirrors.mit.edu/CTAN/systems/texlive/tlnet -Dir texlive
scripts\texlive\sign.ps1 -Dir texlive -DryRun
scripts\texlive\pack.ps1 -Dir texlive -Out dist
```

`-DryRun` lists the programs it would sign and checks the signing catalogs, without the Azure credentials. On Linux or
macOS, `pick-mirror.sh` prints the mirror, and `install.sh`, `pack.sh` and `gate.sh` take it from there.

To move to a new revision or year:

1. For a new year, wait until it has been out for two weeks. Put the year and its source in TeX Live's historic
   archive in `texlive.json`, and regenerate `texlive-packages.txt` from that year's `texlive.tlpdb`.
2. Once a year is frozen, point `repository` at its `tlnet-final` in the historic archive.
3. Run the workflow with Publish off, check the archives in its artifacts, then run it with Publish on.
4. Paste the printed hashes and the version into `texliveRelease.ts`.

A published version is never replaced, as for tinymist.
