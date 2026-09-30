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
