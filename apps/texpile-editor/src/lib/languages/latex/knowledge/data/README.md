# data

Everything Texpile knows about LaTeX packages, classes and the kernel, one file each, in the format of
`package-scan/format/SPEC.md` in texpile-tools. `keyed.json` maps each command and environment whose arguments take
keys to the files that give them, and `env-facts.json` what each environment's body is in most files that define it. Only `knowledge/` reads this folder.

`package-scan/format/` in texpile-tools generates it (see its README). Regenerate it there to change it.
