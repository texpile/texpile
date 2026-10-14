---
nav: LaTeX package files
description: Extend IntelliSense in Texpile for unknown LaTeX packages with package files in LaTeX Workshop's format.
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

Folder package files are stored in the `.texpile` folder and are shared with collaborators through Git and real-time collaboration. Global package files are your own, and work in every folder.

With **Save Package File for …**, Texpile will automatically load the package with your TeX installation and draft one. However, in many cases, this first draft might not be reliable and will require double checking.

## An example of a package file

```json
{
	"macros": [{ "name": "reviewnote", "arg": { "format": "[]{}", "snippet": "reviewnote[${1:who}]{${2:text}}" }, "doc": "Review note" }],
	"envs": [{ "name": "reviewbox" }]
}
```

Package files use LaTeX Workshop's package format, and you can use them directly.

## Reference

A package file with every field:

```json
{
	"macros": [
		{
			"name": "reviewnote",
			"arg": {
				"format": "[]{}",
				"snippet": "reviewnote[${1:color=red}]{${2:text}}",
				"keys": ["note options"],
				"keyPos": 0
			},
			"detail": "review",
			"doc": "Review note",
			"unusual": false
		}
	],
	"envs": [{ "name": "reviewbox" }],
	"keys": {
		"note options": ["color=", "inline"],
		"package options": ["draft", "final"]
	},
	"args": ["package options"]
}
```

Comments and trailing commas are allowed.

### The file

| Field    | Type                         | Default | Description                                                                                               |
| -------- | ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `macros` | entry[]                      | `[]`    | The package's commands. Each item is an [entry](#an-entry).                                               |
| `envs`   | entry[]                      | `[]`    | The package's environments. Each item is an [entry](#an-entry).                                           |
| `keys`   | `{ "group name": string[] }` | `{}`    | Named groups of keys, such as `color=` or `draft`. An entry's `arg.keys` and the file's `args` name them. |
| `args`   | string[]                     | none    | Groups from `keys` that completion offers as package options, in `\usepackage[…]`.                        |

### An entry

One item in `macros` or `envs`.

| Field     | Type                   | Default          | Description                                                                                     |
| --------- | ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `name`    | string                 | none             | Required. The command without its backslash, such as `"reviewnote"`, or the environment's name. |
| `arg`     | [arg](#an-entry-s-arg) | none             | The command's or environment's arguments.                                                       |
| `detail`  | string                 | the package name | Shown beside the name in the completion list.                                                   |
| `doc`     | string                 | none             | Shown in the completion list's info panel.                                                      |
| `unusual` | boolean                | `false`          | `true` keeps the entry out of the completion list.                                              |

### An entry's arg

The `arg` object of an entry.

| Field     | Type                     | Default | Description                                                                                                                                   |
| --------- | ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`  | string, such as `"[]{}"` | none    | Required. The arguments in order: `[]` optional, `{}` required. The visual editor keeps them attached. `()` and `<>` work in completion only. |
| `snippet` | string                   | none    | Required. What completion inserts, without the backslash, in [snippet syntax](snippets.md#syntax-and-variables).                              |
| `keys`    | string[]                 | none    | Groups from the file's `keys` that completion offers inside one argument.                                                                     |
| `keyPos`  | number                   | `0`     | Which argument in `format` takes those keys, counted from 0. `0` is the `[]` in `"[]{}"`.                                                     |

## Errors

| Message                                                                     | Fix                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| The file is not valid JSON: line 5, column 24 (…)                           | Fix the JSON near that line and column.                  |
| The file needs to start with { and end with }.                              | Put the contents inside one pair of braces.              |
| 2 of its entries are not in the package file format, so they were left out. | Check those entries against the [reference](#reference). |

[Snippets](snippets.md) [LaTeX source editor](latex/source-editor.md)
