# data

Everything Texpile knows about LaTeX packages, classes and the kernel, one file each, in the format of
`package-scan/format/SPEC.md` in texpile-tools. `keyed.json` maps each command and environment whose arguments take
keys to the files that give them, `env-facts.json` what each environment's body is in most files that define it, and
`commands.json` the commands with an argument read by its role, and `registries.json` the colors, counters and other
names those files provide. `package-for.json` gives the package to load for a command or environment name. Only `knowledge/` reads this folder.

`package-scan/format/` in texpile-tools generates it (see its README). Regenerate it there to change it.
