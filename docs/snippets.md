---
nav: Snippets
description: Write your own snippets for LaTeX, Typst and Markdown in Texpile, expand them as you type in math or text, and wrap a selection in a function.
blurb: Your own triggers, expanded as you type.
icon: code
order: 26.5
section: Editor tips
---

# Snippets

A snippet turns a short trigger into longer text with places to fill in. Type `dint` in an equation and it becomes `\int_{0}^{1} \, \mathrm{d}x`, with Tab moving through the limits, the integrand and the variable. Snippets work in the source editor, and in the visual editor's text and equations.

| Where to find it          | Path                                                                      | Note                                                   |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| This folder's snippets    | Command palette › Edit Project Snippets, or Preferences › Snippets › Edit | Opens `.texpile/snippets.json`, made empty if missing. |
| Snippets for every folder | Command palette › Edit Global Snippets, or Preferences › Snippets › Edit  | Opens `snippets.json` in Texpile's own data folder.    |
| Expanding as you type     | Preferences › Snippets › Expand snippets automatically                    | On by default.                                         |

A folder's snippets replace global ones of the same name, and global ones replace the built-in ones. The folder's file is shared through Git with the rest of the project. A bar above an open snippet file names which one it is, says how many entries were skipped, and links back to this page.

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

Each entry is named, and the name is what the popup and the menus show. A snippet file from VS Code can be used as it is: its entries go at the top level, without `v` and `snippets`. Comments and trailing commas are allowed.

| Field         | What it does                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `prefix`      | The trigger, or a list of triggers.                                                                   |
| `body`        | The text inserted. One text for every language, or `latex`, `typst` and `markdown` each with its own. |
| `description` | Shown in the popup.                                                                                   |
| `scope`       | The languages it applies to, such as `"latex,typst"`. All three when left out.                        |
| `context`     | `math`, `inline-math`, `display-math`, `text`, `code` (Typst only) or `any`. `any` when left out.     |
| `auto`        | `true` expands as soon as the trigger is typed. Otherwise it waits in the popup for Enter.            |
| `word`        | `true` fires only at the start of a word. On for Typst snippets that expand on their own.             |
| `regex`       | `true` reads the prefix as a regular expression. See below.                                           |
| `flags`       | Regular expression flags: `i`, `u`.                                                                   |
| `priority`    | When several snippets match, the higher one wins. 0 when left out.                                    |
| `key`         | A keyboard shortcut that runs the snippet, such as `Mod-Shift-o`. `Mod` is Ctrl, or Cmd on macOS.     |
| `disabled`    | `true` turns off the snippet of the same name from the global file or the built-in ones.              |
| `wrap`        | A function name. The snippet wraps the selection in a call to it. See below.                          |
| `args`        | Extra arguments for `wrap`, such as `fill: red`.                                                      |
| `visual`      | How the visual editor draws a call to the `wrap` function. See below.                                 |

## In the body

| Write                 | To get                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| `$1`, `$2`            | Places Tab moves through, in order. The same number twice is filled in once.         |
| `${1:text}`           | A place that starts with `text` selected.                                            |
| `$0`                  | Where the cursor ends. The end of the body when left out.                            |
| `${1\|one,two\|}`     | A place with a list to pick from.                                                    |
| `${TM_SELECTED_TEXT}` | The selected text.                                                                   |
| `\\$`                 | A `$` sign. LaTeX and Typst use `$` for math, so a body that inserts `$…$` needs it. |

In the JSON file, each backslash in LaTeX is written twice: `"\\frac"` inserts `\frac`.

> [!NOTE]
> Typst equations already use words such as `dif`, `Re` and `oo`. A Typst snippet that expands on its own with one of these as its trigger expands every time the word is typed, so Texpile warns about it when it reads the file.

## Triggers from a pattern

With `"regex": true` the prefix is a regular expression matched against the text just typed, up to the cursor. `[[0]]`, `[[1]]` in the body insert what its groups matched.

```json
"Subscript": {
	"prefix": "([A-Za-z])(\\d)",
	"regex": true,
	"auto": true,
	"context": "math",
	"body": { "latex": "[[0]]_{[[1]]}", "typst": "[[0]]_[[1]]" }
}
```

`${NAME}` inside a pattern stands for a list named under `"variables"` at the top of the file. `${GREEK}` and `${SYMBOL}` are built in.

A pattern is tested on every keystroke. Patterns in a folder's file therefore wait until you press **Allow** in the bar that appears at the top of the window, once per folder on this computer.

## Wrap with

Select text, right-click, and pick a snippet under **Wrap With**. An entry with `"wrap": "offen"` turns the selection into `#offen[selected text]` in Typst, without the `#` inside code, and into `\offen{selected text}` in LaTeX. Any snippet whose body uses `${TM_SELECTED_TEXT}` is listed too. The same entries are in the command palette while text is selected.

```json
"Open point": { "scope": "typst", "wrap": "offen", "key": "Mod-Shift-o" }
```

A selection that starts or ends inside a piece of markup, such as half of a `*bold*` run, is not wrapped.

**Wrap With** and the keys work in the visual editor too.

## Drawing a function in the visual editor

The visual editor cannot know what a function of your own does, so a call to one shows as raw code. A `wrap` entry can say how to draw it instead. The words inside then stay ordinary text you can edit, and saving writes the call back.

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

| Field        | What it does                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `look`       | `inline` keeps the words in the line, `box` draws a frame around them. `inline` when left out. |
| `label`      | A short text drawn before the words, such as `TODO`.                                           |
| `color`      | The color of the words: `red`, `orange`, `yellow`, `green`, `blue`, `purple` or `gray`.        |
| `background` | A fill behind the words, from the same colors.                                                 |
| `font`       | One or more of `bold`, `italic`, `smallcaps`, `underline` and `strike`.                        |
| `spellcheck` | `false` leaves the words out of spell check. `true` when left out.                             |

Commands Texpile already draws, such as `\emph` or `\hl`, keep their own look. A function whose argument is not words, such as a label or a file name, is best left without `visual`, so it stays code.

## In visual text

In a paragraph or heading of the visual editor, a `text` or `any` snippet that expands on its own does so as you type its trigger. Any other one expands when Tab is pressed right after its trigger. The body is read as the file's own language, so `\\emph{$1}` in LaTeX or `_$1_` in Typst and Markdown goes in as emphasized text with the cursor inside. Other places to fill in keep their defaults, and only the first is selected.

## In visual equations

In a LaTeX equation in the visual editor, a snippet that expands on its own does so as you type its trigger, and every other math snippet is listed when Tab opens the math search. Each place to fill in becomes an empty slot, and Tab moves to the next slot before it opens the search. Defaults are left out, and the slots are visited in the order the equation editor keeps them, so an integral's upper limit comes before its lower one. Pattern triggers work in the source editor only.

In a Typst equation, a trigger made of letters expands when it is typed as a whole name, so `point` never expands `oint`. The snippet goes in as its Typst body with its defaults filled in, and the cursor ends after it: Typst has no empty slot to stop at.

## From LaTeX Suite

Snippets written for the LaTeX Suite plugin of Obsidian come over with **Import LaTeX Suite Snippets** in the command palette. Pick the snippets file, and its entries are added at the top of the folder's `.texpile/snippets.json`, which then opens. An entry the file already has by the same name is kept.

| In LaTeX Suite                   | Becomes                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `t`, `m`, `M`, `n`               | `context`: `text`, `math`, `display-math`, `inline-math`                                |
| `A`, `r`, `w`                    | `auto`, `regex`, `word`                                                                 |
| `v` with `${VISUAL}`             | An entry under **Wrap With**, using `${TM_SELECTED_TEXT}`                               |
| `$0`, `$1` in the replacement    | `$1`, `$2`: the first place is still visited first                                      |
| A replacement that is a function | Left out, with a note: only Obsidian can run it                                         |
| `c` or `C` alone                 | Left out: Texpile has no snippets for code blocks                                       |
| `T` alone                        | Left out: Texpile reads `\text{}` in math as text, so it cannot keep these to `\text{}` |

Pattern triggers wait for **Allow** like any others in a folder's file.

## Math typing helpers

Three helpers in the source editor work on the formula around the cursor. Each has its own switch in Preferences › Snippets.

| Helper              | What it does                                                                                                                                                       | Default |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Auto-fraction       | In LaTeX and Markdown math, `a/` becomes `\frac{a}{}` with the cursor below. `x^2/`, `\alpha/` and `(a+b)/` work the same way. A second `/` takes it back to `a/`. | Off     |
| Tab out of brackets | In math, Tab moves past the next `)`, `]` or `}`, then out of the formula. At the start of a line Tab still indents.                                               | On      |
| Matrix keys         | In `matrix`, `pmatrix`, `array`, `align` and similar environments, Tab adds `&` and Shift+Enter starts a row. In a Typst `mat(…)`, they add `, ` and `; `.         | On      |

## Commands of other packages

Texpile knows the commands of a few hundred LaTeX packages. For one it does not know, a package file adds them: its commands and environments then complete in documents that load the package, and the visual editor keeps their arguments attached.

A package file is `.texpile/packages/<name>.json` in the folder, or `packages/<name>.json` in Texpile's own data folder for every folder. It uses the package format of LaTeX Workshop, so files written for it work unchanged.

```json
{
	"macros": [{ "name": "offen", "arg": { "format": "[]{}", "snippet": "offen[${1:who}]{${2:text}}" }, "doc": "Open point" }],
	"envs": [{ "name": "reviewbox" }]
}
```

To start one, open a document that loads the package and run **Save Package File for <name>** from the command palette. **Edit Package File for <name>** opens one that exists, and **Edit Global Package File for <name>** one in Texpile's own data folder. Texpile drafts the file from the package's own `.sty` in your TeX installation. Check it before relying on it: the draft lists the commands the package defines with `\newcommand` and similar, which can include some that are meant for internal use, and misses those it builds in other ways.

Without a package file, Texpile still reads the arguments of an installed package's commands from its `.sty`, so the visual editor keeps them attached, but it does not offer the commands for completion.

## Built-in snippets

Typing `@` in math offers the built-in ones: `@a` for alpha, `@/` for a fraction, `@sum`, `@int`, and others, with Typst equivalents where Typst has the symbol. Turn one off with `{ "disabled": true }` under its name, such as `"@a"`.

## When a snippet does not load

An entry Texpile cannot read is skipped, and a note says which one and why. The rest of the file still loads. Preferences › Snippets lists every skipped entry.

[Typing and selecting](typing.md) [Preferences](preferences.md)
