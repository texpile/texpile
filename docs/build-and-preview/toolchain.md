---
description: The Programs page in Preferences shows the programs Texpile runs and where it finds them. It picks the TeX and Typst install Texpile uses and installs TeX Live and tinymist.
order: 1
---

# Programs

**File › Preferences… › Programs** shows the programs Texpile runs and where it finds them.

![The Programs page of Preferences with the TeX picker, four LaTeX programs marked Not found, 4 more programs work, and the Typst picker](../../landing/src/lib/assets/showcase/docs/app/preferences-toolchain.png)

Each language has a picker for the install Texpile uses: **TeX** for LaTeX and **Typst** for Typst. Under it, a program that is missing or does not run gets a row of its own. The programs that work fold into one line. **Show** lists them with their versions.

Texpile needs only the programs your commands call. The default compile command needs latexmk and lualatex. Live preview needs lualatex, **Format Document** needs latexindent, and jumping between the text and the PDF needs synctex.

Texpile reads your PATH once, when it starts: restart it after you change PATH. Folders you add under **Other folders** apply at once.

## The Set Up dialog

**Set Up LaTeX** or **Set Up Typst** opens when a compile, a jump, Format Document or the live preview needs a program that is missing.

![The Set Up LaTeX dialog saying latexindent is not found, with Installed elsewhere, More in Preferences, Close, and How to install one](../../landing/src/lib/assets/showcase/docs/app/set-up-latex-dialog.png)

- **Installed elsewhere? Add its folder** adds the folder to **Other folders**.
- **Install TeX Live** installs TeX Live when Texpile finds no TeX. See [Install TeX Live](#install-tex-live).
- **How to install one** opens the [TeX install guide](../installation/latex/README.md).
- If TeX Live or MiKTeX is installed but lacks the program, the dialog says so. Add the program with that distribution's package manager.

## Pick an install and add folders

The **TeX** picker lists every TeX Live and MiKTeX Texpile finds. The one in use has a check mark. Pick another to put its folder first. **(on PATH)** marks the one your PATH reaches.

Texpile searches **Other folders** before PATH, for every program it runs, including your compile command. **Locate** on a **Not found** row adds the program's folder.

## Install TeX Live

Open the **TeX** picker and click **Install TeX Live 2026 from Texpile**. The **Set Up LaTeX** dialog offers it too when Texpile finds no TeX. Texpile downloads TeX Live 2026 from dl.texpile.com and checks it against a checksum. The download is 174 MB on Linux, 230 MB on macOS and 287 MB on Windows. It holds lualatex, pdflatex, xelatex, latexmk, biber and the packages most papers load.

![The TeX picker open with TeX Live 2023/Debian checked and Install TeX Live 2026 from Texpile, 174 MB](../../landing/src/lib/assets/showcase/docs/app/toolchain-tex-picker.png)

After the install, the picker uses **TeX Live 2026 (installed by Texpile)**. Pick another install to switch back. To delete it, click **Remove** next to "Texpile installed TeX Live 2026."

When a document loads a package this TeX Live lacks, the live preview and **Compile** install it with tlmgr, TeX Live's own package manager, and compile again. Each package needs the internet once.

## Install tinymist for Typst

Open the **Typst** picker and click the option that starts with **Install tinymist**. The **Set Up Typst** dialog and the "tinymist is not installed." bar above a `.typ` file offer it too.

After the install, the picker uses the entry that ends in **(installed by Texpile)**. Pick another install to switch back. **Remove** deletes the tinymist Texpile installed.

If that tinymist fails to run on your computer, [install tinymist yourself](../installation/typst/README.md).
