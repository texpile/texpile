---
nav: Snippets
description: Write your own snippets for LaTeX, Typst and Markdown in Texpile, expand them as you type in math or text, and wrap a selection in a function.
blurb: Your own triggers, expanded as you type.
icon: code
order: 26.5
section: Editor tips
---

# Snippets

Your own triggers, expanded as you type.

A snippet is a macro that automatically fills in text based on a trigger. For instance, you can type `dint` and Texpile will automatically fill in `\int_{0}^{1} \, \mathrm{d}x`, with Tab moving through the limits, the integrand and the variable. Snippets work in the source editor, and in the visual editor's text and equations.

| Where to find it          | Path                                                                      | Note                                                |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| This folder's snippets    | Command palette › Edit Project Snippets, or Preferences › Snippets › Edit | Opens `.texpile/snippets.json`, created if missing. |
| Snippets for every folder | Command palette › Edit Global Snippets, or Preferences › Snippets › Edit  | Opens `snippets.json` in Texpile's own data folder. |

Folder snippets are stored in the `.texpile` folder and are shared with collaborators through Git and real-time collaboration. Global snippets store your own snippets, which are not shared with anyone. If there are conflicts, Texpile prioritizes folder snippets, and both take priority over the built-in ones. A guest in a shared session gets the host's folder snippets, and can turn them off in Preferences › Snippets.

## A snippet file

```json
{
	"v": 1,
	"snippets": {
		"Definite integral": {
			"prefix": "dint",
			"context": "math",
			"auto": true,
			"body": {
				"latex": "\\int_{${1:0}}^{${2:1}} $3 \\, \\mathrm{d}${4:x}$0",
				"typst": "integral_(${1:0})^(${2:1}) $3 dif ${4:x}$0"
			}
		}
	}
}
```

Texpile extends upon VS Code's snippet system, so in general your snippets from VS Code should work. You can paste a VS Code file in as it is, with its entries at the top level. Comments and trailing commas are allowed. The popup and the menus show each entry by its name.

### Fields

| Field         | Type                                                                     | Default                        | Description                                                                                                                    |
| ------------- | ------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `prefix`      | string or string[]                                                       | none                           | The trigger. Required, unless the entry has a `key` or a `wrap`.                                                               |
| `body`        | string, or `{ "latex", "typst", "markdown" }`                            | none                           | The text inserted, one for every language or one per language. Markdown math uses the `latex` body when `markdown` is missing. |
| `description` | string                                                                   | none                           | Shown beside the popup.                                                                                                        |
| `scope`       | `"latex"`, `"typst"`, `"markdown"`, or several joined with commas        | all three                      | The languages the snippet works in.                                                                                            |
| `context`     | `"math"`, `"inline-math"`, `"display-math"`, `"text"`, `"code"`, `"any"` | `"any"`                        | Where the trigger fires. `code` is Typst only, inside `#{ }`.                                                                  |
| `auto`        | boolean                                                                  | `false`                        | `true` expands as soon as you type the trigger. `false` waits in the popup for Enter.                                          |
| `word`        | boolean                                                                  | `false`, `true` for Typst auto | Fires only at the start of a word.                                                                                             |
| `regex`       | boolean                                                                  | `false`                        | Reads the prefix as a regular expression. See [Regex triggers](#regex-triggers).                                               |
| `flags`       | string of `i`, `u`                                                       | `""`                           | Regular expression flags.                                                                                                      |
| `priority`    | number                                                                   | `0`                            | When several snippets match, the higher one wins.                                                                              |
| `key`         | string, such as `"Mod-Shift-o"`                                          | none                           | A keyboard shortcut that runs the snippet. `Mod` is Ctrl, or Cmd on macOS.                                                     |
| `disabled`    | boolean                                                                  | `false`                        | `true` turns off the global or built-in snippet of the same name.                                                              |
| `wrap`        | string, a function name                                                  | none                           | Wraps the selection in a call to this function. See [Wrap With](#wrap-with).                                                   |
| `args`        | string, such as `"fill: red"`                                            | none                           | Extra arguments for `wrap`.                                                                                                    |
| `visual`      | object                                                                   | none                           | How the visual editor draws a call to the `wrap` function. See [Drawing a function](#drawing-a-function-in-the-visual-editor). |

### Body syntax

| Syntax                             | Result                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$1`, `$2`                         | Places Tab moves through, in order. The same number twice is one place: it starts with the first default given for it, and what you type goes into every copy.                                  |
| `${1:text}`                        | A place that starts with `text` selected.                                                                                                                                                       |
| `$0`                               | Where the cursor ends. The end of the body by default.                                                                                                                                          |
| `${1\|one,two\|}`                  | A place with a list to pick from.                                                                                                                                                               |
| `${1:outer ${2:inner}}`            | A place inside a place. Tab visits the outer one, then the inner one. Typing over the outer one removes the inner one.                                                                          |
| `${1/(.*)/${1:/upcase}/}`          | A copy of place 1, changed when Tab leaves the place. `/upcase`, `/downcase`, `/capitalize`, `/camelcase`, `/pascalcase`, `${1:+yes}`, `${1:-no}` and `${1:?yes:no}` work as in VS Code.        |
| `$TM_FILENAME`, `$CURRENT_YEAR`, … | VS Code's variables: the file and its folder, the line, the date and time, random values and the comment marks. `${CLIPBOARD}` is always empty. `${NAME:text}` gives `text` when NAME is empty. |
| `${TM_SELECTED_TEXT}`              | The selected text, with its own indentation. With several selections, each one is wrapped.                                                                                                      |
| `\\$`                              | A `$` sign. LaTeX and Typst use `$` for math, so a body that inserts `$…$` needs it.                                                                                                            |
| `\\\\\\\\`                         | The LaTeX line break `\\`.                                                                                                                                                                      |

Each body line after the first takes the indentation of the line the snippet starts on, and a tab at the start of a body line adds one indentation step. Any other `$name` becomes a place holding the name, as in VS Code. To insert `$x$`, write `\\$x\\$` in the JSON file.

In the JSON file, each backslash is written twice: `"\\frac"` inserts `\frac`. A backslash in front of another backslash, a `$` or a `}` makes that character plain, as in VS Code. So two backslashes in a row take four in the body and eight in the JSON file.

> [!NOTE]
> Typst equations already use words such as `dif`, `Re` and `oo`. A Typst auto snippet with one of these as its trigger expands every time you type the word, so Texpile warns about it when it reads the file.

## Regex triggers

With `"regex": true`, the prefix is a regular expression matched against the text you just typed, up to the cursor. `[[0]]`, `[[1]]` in the body insert what its groups matched. Regex triggers expand as you type, so they need `"auto": true`.

```json
"Subscript": {
	"prefix": "([A-Za-z])(\\d)",
	"regex": true,
	"auto": true,
	"context": "math",
	"body": { "latex": "[[0]]_{[[1]]}", "typst": "[[0]]_[[1]]" }
}
```

`${NAME}` inside a pattern stands for a list under `"variables"` at the top of the file. `${GREEK}` and `${SYMBOL}` are built in.

Texpile tests each pattern on every keystroke, and a badly written one can freeze the editor. So patterns from a folder's file wait until you press **Allow** in the bar at the top of the window, once per folder on this computer. The same goes for patterns that use the folder's variables, and the bar asks again when they change. A guest presses **Allow** for the host's patterns too.

## Wrap With

Select text, right-click, and pick a snippet under **Wrap With**. The same entries are in the command palette while text is selected. An entry with `"wrap": "offen"` turns the selection into `\offen{selected text}` in LaTeX, `#offen[selected text]` in Typst markup and `offen[selected text]` in Typst code. Any snippet whose body uses `${TM_SELECTED_TEXT}` is listed too.

```json
"Open point": { "scope": "typst", "wrap": "offen", "key": "Mod-Shift-o" }
```

The selection has to hold whole pieces of markup. One that splits a `*bold*` run or a `\textbf{}` group stays as it is. **Wrap With** and the keys work in the visual editor too, and keep the formatting of the selection.

## Drawing a function in the visual editor

The visual editor shows a call to your own function as raw code. A `wrap` entry can tell it how to draw the call instead. The words inside then stay ordinary text you can edit, and saving writes the call back.

```json
"Open point": {
	"scope": "typst",
	"wrap": "offen",
	"visual": { "label": "xxx", "background": "yellow" }
},
"Revised": {
	"scope": "latex",
	"wrap": "rev",
	"visual": { "look": "box", "label": "Rev", "color": "red" }
}
```

| Field        | Type                                                                       | Default    | Description                                                |
| ------------ | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `look`       | `"inline"`, `"box"`                                                        | `"inline"` | `inline` keeps the words in the line, `box` draws a frame. |
| `label`      | string                                                                     | none       | A short text drawn before the words, such as `TODO`.       |
| `color`      | `"red"`, `"orange"`, `"yellow"`, `"green"`, `"blue"`, `"purple"`, `"gray"` | none       | The color of the words.                                    |
| `background` | same as `color`                                                            | none       | A fill behind the words.                                   |
| `font`       | `"bold"`, `"italic"`, `"smallcaps"`, `"underline"`, `"strike"`, or several | none       | The font of the words.                                     |
| `spellcheck` | boolean                                                                    | `true`     | `false` leaves the words out of spell check.               |

Commands Texpile already draws, such as `\emph` or `\hl`, keep their own look. For a function that takes a label or a file name, leave `visual` out so the call stays code.

## Visual editor text

In a paragraph or heading, a `text` or `any` auto snippet expands as you type its trigger. Any other one expands when you press Tab right after the trigger. Texpile reads the body in the file's own language, so `\\emph{$1}` in LaTeX or `_$1_` in Typst and Markdown goes in as emphasized text with the cursor inside.

The first place is selected, and the others keep their defaults. A place used more than once starts with the same text everywhere. When the first place sits in a link address, a file name or part of a command name, the cursor goes to the next place, or after the inserted text. Regex triggers work here too.

## Visual editor equations

In a LaTeX equation, an auto snippet expands as you type its trigger. Tab or Ctrl Space opens the math search, which lists every other math snippet. Ctrl Space inside math in the source editor opens the same search.

Each empty place becomes a slot, including `$0` when it sits before the end, and Tab moves to the next slot before it opens the search. Slots start empty, and Tab visits them in the order the equation editor keeps them, so an integral's upper limit comes before its lower one. A place used twice is a slot where it first appears and its default everywhere else. Equations expand plain triggers only, so regex triggers stay as typed.

In a Typst equation, a trigger made of letters expands as a whole name, so typing `point` leaves `oint` alone. The snippet goes in with its defaults filled in. A place without a default becomes an empty slot, the cursor starts in the first one, and Tab moves to the next. When you save, an empty slot inside parentheses, as in `sqrt()`, becomes `""`, and the other empty slots are dropped.

`inline-math` snippets expand in inline equations only, and `display-math` ones in display equations only. Undo after an expansion gives back the trigger as typed.

## Importing from LaTeX Suite

You can import snippets written for the LaTeX Suite plugin of Obsidian with **Import LaTeX Suite Snippets** in the command palette. Pick the snippets file, and Texpile adds its entries to the top of the folder's `.texpile/snippets.json`. When the file already has an entry with the same name, Texpile keeps that one.

| In LaTeX Suite                   | Becomes                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `t`, `m`, `M`, `n`               | `context`: `text`, `math`, `display-math`, `inline-math`  |
| `A`, `r`, `w`                    | `auto`, `regex`, `word`                                   |
| `v` with `${VISUAL}`             | A **Wrap With** entry using `${TM_SELECTED_TEXT}`         |
| `$0`, `$1` in the replacement    | `$1`, `$2`, so the first place is still visited first     |
| A replacement that is a function | Skipped with a note, as only Obsidian can run it          |
| `c` or `C` alone                 | Skipped, as Texpile snippets work in text and math        |
| `T` alone                        | Skipped, as Texpile reads `\text{}` in math as plain text |
| `r` without `A`                  | Skipped, as regex triggers expand as you type             |

Imported regex triggers wait for **Allow** like any others in a folder's file.

## Math typing helpers

The source editor has three helpers for the formula around the cursor. They are separate from snippets and off by default. Turn them on in Preferences › Editor › Source editor.

| Helper              | What it does                                                                                                                                                       | Default |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Auto-fraction       | In LaTeX and Markdown math, `a/` becomes `\frac{a}{}` with the cursor below. `x^2/`, `\alpha/` and `(a+b)/` work the same way. A second `/` takes it back to `a/`. | Off     |
| Tab out of brackets | In math, Tab moves past the next `)`, `]` or `}`, then out of the formula. At the start of a line Tab still indents.                                               | Off     |
| Matrix keys         | In `matrix`, `pmatrix`, `array`, `align` and similar environments, Tab adds `&` and Shift+Enter starts a row. In a Typst `mat(…)`, they add `, ` and `; `.         | Off     |

## Package files

Texpile knows the commands of a few hundred LaTeX packages. A package file adds the commands of any other package: they complete in documents that load it, and the visual editor keeps their arguments attached.

A package file is `.texpile/packages/<name>.json` in the folder, or `packages/<name>.json` in Texpile's own data folder for every folder. It uses LaTeX Workshop's package format, so files written for LaTeX Workshop work as they are.

```json
{
	"macros": [{ "name": "offen", "arg": { "format": "[]{}", "snippet": "offen[${1:who}]{${2:text}}" }, "doc": "Open point" }],
	"envs": [{ "name": "reviewbox" }]
}
```

To start one, open a document that loads the package and run **Save Package File for <name>** from the command palette. **Edit Package File for <name>** opens an existing one, and **Edit Global Package File for <name>** opens one in Texpile's own data folder. Texpile drafts the file from the package's `.sty` in your TeX installation. Check the draft before relying on it: it lists the commands the package defines with `\newcommand` and similar, which can include ones meant for internal use, and skips commands built some other way.

Texpile also reads the arguments of an installed package's commands from its `.sty`, so the visual editor keeps them attached. Completion for those commands needs a package file.

## Built-in snippets

Typing `@` in math offers the built-in snippets: `@a` for alpha, `@/` for a fraction, `@sum`, `@int`, and others, with Typst equivalents where Typst has the symbol. To turn one off, add `{ "disabled": true }` under its name, such as `"@a"`.

## Errors

Texpile skips broken entries and loads the rest of the file. Errors show in three places: the bar above the file while it is open, its row in Preferences › Snippets, and a note in the corner when the file changes while it is closed. With several errors, the bar shows the first and **Show all** lists the rest.

### The whole file

| Message                                           | Fix                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The file is not valid JSON: line 5, column 24 (…) | Fix the JSON near that line and column, usually a missing comma or quotation mark. Until then, Texpile keeps using the last version that loaded. |
| The file needs to start with { and end with }.    | Put the entries inside one pair of braces.                                                                                                       |
| Unsupported file version ("v": 2).                | A newer Texpile wrote the file. Update Texpile, or set `"v": 1`.                                                                                 |

### One entry

| Message                                                                      | Fix                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Each entry needs to be in { }, like "Name": { … }.                           | Write the entry as a name followed by its fields in braces.                           |
| Has no "body", the text it inserts.                                          | Add a `body`, or a `wrap` for a Wrap With entry.                                      |
| Has no "prefix", the text you type to use it.                                | Add a `prefix` or a `key`, or make it a Wrap With entry.                              |
| "body" has "…", which is not a language.                                     | Use `latex`, `typst` or `markdown` as the names inside `body`.                        |
| "visual" only works together with "wrap", the function whose calls it draws. | Add `wrap` with the function name, or remove `visual`.                                |
| "visual" has "…", which it does not know.                                    | Use only `look`, `label`, `color`, `background`, `font` and `spellcheck`.             |
| "…" needs to be …                                                            | The field has the wrong type, such as a number in quotes. The message names the type. |
| The "prefix" pattern is not a valid regular expression (…).                  | Fix the pattern. The text in brackets says what is wrong.                             |
| The pattern uses ${NAME}, but "variables" has no NAME for latex.             | Add the list under `variables`, or take it out of the pattern.                        |
| A "regex" pattern needs "auto": true as well.                                | Add `"auto": true`.                                                                   |

### Warnings

A snippet with a warning still loads and works, probably differently from what you meant.

| Message                                                                                      | Fix                                                                          |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| "dif" is already a word in Typst math, so a plain dif can no longer be typed in an equation. | Pick another trigger, or limit the snippet to LaTeX with `"scope": "latex"`. |

### Package files

| Message                                                                     | Fix                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| The file is not valid JSON: line 5, column 24 (…)                           | Fix the JSON near that line and column.                   |
| The file needs to start with { and end with }.                              | Put the contents inside one pair of braces.               |
| 2 of its entries are not in the package file format, so they were left out. | Check those entries against LaTeX Workshop's file format. |

[Typing and selecting](typing.md) [Preferences](preferences.md)
