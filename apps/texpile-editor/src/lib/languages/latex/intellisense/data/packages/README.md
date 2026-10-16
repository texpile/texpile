# packages

One file per LaTeX package and class (`class-<name>.json`) of TeX Live 2026, and of the CTAN packages outside it. Each lists the commands, environments, options and keys the package defines, in LaTeX Workshop's package format. Agents checked every entry against the package's source and manual.

`latex-document` holds the LaTeX kernel and is always loaded. `tikzlibrary<name>`, `pgflibrary<name>`, `pgfplotslibrary<name>` and `tcolorboxlibrary<name>` hold what each library adds. `deps` lists the package files a package loads, from the log of TeX loading it. An entry with `if` exists only under that package option or language. An entry with `math` belongs to math input.

A `doc` is a sentence copied word for word from the package's manual. A math symbol's `detail` is its glyph and its `doc` the name `unicode-math-table.tex` gives it.

`index.ts` maps each command and environment whose arguments take keys to the packages that give them. When several do, the one with the most keys comes first.

`package-scan/verify/replace/split-data.mjs` in texpile-tools generates this folder. Regenerate it there to change it.
