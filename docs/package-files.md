---
nav: LaTeX package files
description: Extend IntelliSense in Texpile for unknown LaTeX packages with package files.
blurb: Extends IntelliSense for unknown LaTeX packages.
icon: package
order: 36.6
section: Advanced
---

# LaTeX package files

Extends IntelliSense for unknown LaTeX packages.

Texpile by default supports a wide range of completion for LaTeX packages. However, for the less common ones, you will have to create your own package files for Texpile to support them.

## Where to find it

1. Open a LaTeX file in the **source editor** that uses the package (`\usepackage{package name}`).
2. Open the command palette with Ctrl K (Cmd K on macOS).
3. Type in **Save Package File**, **Edit Package File**, or **Edit Global Package File**.

Preferences › Editor › LaTeX lists your package files under **Package files** in the Completion section. Click **Manage** to open, delete or draft one.

Folder package files are stored in the `.texpile` folder and are shared with collaborators through Git and real-time collaboration. Global package files are your own, and work in every folder. They are stored in the `packages` folder of Texpile's data folder:

| System  | Folder                                                   |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%\texpile-desktop\packages`                     |
| macOS   | `~/Library/Application Support/texpile-desktop/packages` |
| Linux   | `~/.config/texpile-desktop/packages`                     |

The portable Windows build keeps them in `data\packages` next to the program. The bar above an open package file names its place: "Commands for the review package in this folder" or "Commands for the review package in every folder".

With **Save Package File for …**, Texpile will automatically load the package with your TeX installation and draft one. However, in many cases, this first draft might not be reliable and will require double checking. The command lists up to 10 packages that the open file loads itself and that Texpile has no data or package file for. The package needs to be installed in your TeX distribution. For any other package, write the file by hand in one of the folders above.

A package file is named after the package: `.texpile/packages/review.json` for `\usepackage{review}`, and `class-` before a class name (`class-thesis.json` for `\documentclass{thesis}`). A package file for a package Texpile already knows adds to what Texpile knows. An entry with the same name replaces the fields it states and keeps the rest. A folder package file does the same over a global one.

## An example of a package file

```json
{
	"version": 1,
	"macros": [
		{
			"name": "reviewnote",
			"args": [
				{ "kind": "o", "placeholder": "who" },
				{ "kind": "m", "placeholder": "text" }
			],
			"doc": "Review note"
		}
	],
	"envs": [{ "name": "reviewbox" }]
}
```

## Reference

A package file with every field:

```json
{
	"version": 1,
	"deps": [{ "id": "packages/xcolor" }, { "id": "packages/fontspec", "if": "!draft", "engines": ["lualatex", "xelatex"] }],
	"macros": [
		{
			"name": "reviewnote",
			"args": [
				{ "kind": "s" },
				{ "kind": "o", "placeholder": "options", "keys": ["packages/review#note"] },
				{ "kind": "m", "placeholder": "text" }
			],
			"if": "draft",
			"in": "text",
			"prints": "✎",
			"doc": "Review note"
		}
	],
	"envs": [{ "name": "reviewbox", "args": [{ "kind": "o" }], "star": { "args": [] } }],
	"keys": {
		"packages/review#note": [
			{ "key": "color", "placeholder": "color" },
			{ "key": "inline", "bare": true }
		],
		"packages/review#options": [
			{ "key": "draft", "bare": true },
			{ "key": "final", "bare": true }
		]
	}
}
```

Comments and trailing commas are allowed.

### The file

| Field     | Type                                | Default | Description                                                                                                                       |
| --------- | ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `version` | `1`                                 | none    | Required. The version of the format.                                                                                              |
| `deps`    | [dependency](#a-dependency)[]       | `[]`    | Packages this one loads. Their commands complete too while this package is loaded.                                                |
| `macros`  | [command](#a-command)[]             | `[]`    | The package's commands.                                                                                                           |
| `envs`    | [environment](#an-environment)[]    | `[]`    | The package's environments.                                                                                                       |
| `keys`    | `{ "group id": `[key](#a-key)`[] }` | `{}`    | Named groups of keys. An argument's `keys` names them. The group `packages/<name>#options` holds the options of `\usepackage[…]`. |

A group id is the id of the file that owns it, a `#` and a name: `packages/review#note`. File ids are `packages/<name>`, `classes/<name>` for a class and `kernel/latex` for LaTeX itself.

### A command

One item in `macros`.

| Field    | Type                       | Default | Description                                                                                                                                                                                                                                                  |
| -------- | -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`   | string                     | none    | Required. The command without its backslash, such as `"reviewnote"`. A star is an `s` argument.                                                                                                                                                              |
| `args`   | [argument](#an-argument)[] | none    | The arguments in order. Without `args`, the visual editor guesses them from how the command is used. `[]` means it takes none.                                                                                                                               |
| `if`     | string                     | none    | A package option or language the entry needs, such as `"french"`. `"a\|b"` needs one of them, `"a+b"` needs both and `"!a"` needs `a` left out. A bare option counts as its `=true` form, so `"natbib=true"` also holds for `\usepackage[natbib]{biblatex}`. |
| `in`     | string                     | both    | Where the command works: `"math"` or `"text"`. Completion ranks a math command first inside math.                                                                                                                                                            |
| `prints` | string                     | none    | What the command prints, shown beside its name in the completion list, such as a symbol's glyph.                                                                                                                                                             |
| `doc`    | string                     | none    | Shown in the completion list's info panel.                                                                                                                                                                                                                   |
| `hidden` | `true`                     | none    | Keeps the entry out of the completion list.                                                                                                                                                                                                                  |
| `remove` | `true`                     | none    | Removes an entry of this name that comes before, such as one Texpile ships.                                                                                                                                                                                  |

Completion inserts the command with its `o` arguments left out, and shows the full form beside it.

### An environment

One item in `envs`. It takes the fields of a command (without `in: "text"`), and one more.

| Field  | Type   | Default | Description                                                                                                  |
| ------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `star` | object | none    | The starred environment, such as `reviewbox*`, with the fields in which it differs. `{}` makes it identical. |

`name` is the environment without its star.

### An argument

One item in `args`.

| Field         | Type     | Default | Description                                                                                                                                                                                                 |
| ------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`        | string   | none    | Required. How the argument is read: `"m"` a `{}` argument, `"o"` an optional `[]` one, `"s"` a star, `"d()"` and `"d<>"` optional ones in `()` and `<>`, `"r()"` and `"r<>"` required ones, `"v"` verbatim. |
| `placeholder` | string   | none    | The words that stand for the argument, such as `"text"`.                                                                                                                                                    |
| `keys`        | string[] | none    | Key groups that completion offers inside this argument.                                                                                                                                                     |
| `values`      | string[] | none    | The values that completion offers inside this argument, such as `["t", "c", "b"]`.                                                                                                                          |
| `default`     | string   | none    | The value an optional argument takes when it is left out.                                                                                                                                                   |

### A key

One item in a key group.

| Field         | Type     | Default | Description                                                         |
| ------------- | -------- | ------- | ------------------------------------------------------------------- |
| `key`         | string   | none    | Required. The key's name, such as `"color"`.                        |
| `bare`        | `true`   | none    | The key can be given without a value, such as `inline`.             |
| `placeholder` | string   | none    | The key takes a value, shown with these words. `""` means no words. |
| `values`      | string[] | none    | The key takes one of these values.                                  |
| `default`     | string   | none    | The value the key takes when it is given bare.                      |
| `if`          | string   | none    | The package options the key needs, written as a command's `if`.     |

### A dependency

One item in `deps`.

| Field     | Type     | Default      | Description                                                                                                                                                                                                                                          |
| --------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | string   | none         | Required. The file it loads, such as `"packages/xcolor"`, or `"classes/article"` for a class.                                                                                                                                                        |
| `if`      | string   | none         | The package options it needs, written as a command's `if`. `"!draft"` loads it unless `draft` is given.                                                                                                                                              |
| `engines` | string[] | every engine | The engines that load it: `"pdflatex"`, `"lualatex"` and `"xelatex"`. Texpile reads the engine from the folder's compile command, and in a shared session from the host's. A command that names no engine loads only dependencies without `engines`. |

## Errors

| Message                                                                                      | Fix                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| The file is not valid JSON: line 5, column 24 (…)                                            | Fix the JSON near that line and column.                        |
| The file needs to start with { and end with }.                                               | Put the contents inside one pair of braces.                    |
| The file is in the old package file format. …                                                | Rewrite the file in this format, starting with `"version": 1`. |
| 2 entries did not load. "reviewnote": Left out because it is not in the package file format. | Check those entries against the [reference](#reference).       |

[Snippets](snippets.md) [LaTeX source editor](latex/source-editor.md)
