# Code Style Guide

## Naming Conventions

TLDR: Generally, follow Java Coding Conventions, don't force OOP, use class when needed.

1. Classes, interfaces, types, enums: PascalCase. UserProfile, EditorState
2. Methods and functions: camelCase, verb first. parseDocument, resolveSelection
3. Variables and fields: camelCase. activeEditor, pendingChanges
4. Constants: SCREAMING_SNAKE_CASE. MAX_RETRY_COUNT, DEFAULT_THEME
5. Enum members: SCREAMING_SNAKE_CASE. Status.IN_PROGRESS
6. Type parameters: single capital letter or short PascalCase. T, TNode
7. Packages: all lowercase, no underscores
8. Booleans: is, has, can, should prefix. isDirty, hasUnsavedChanges
9. No abbreviations unless universally known. configuration not cfg
10. Acronyms are treated as words. HtmlParser not HTMLParser, parseUrl not parseURL

Exceptions and amendments for this project:

1. Svelte components: PascalCase file and component name, matching each other. EditorToolbar.svelte
2. Non component files: camelCase. resolveSelection.ts, editorState.svelte.ts
3. Folders: camelCase, except a folder wrapping a split component, which takes that component's PascalCase name
4. Type files: name.types.ts beside the file they serve
5. No get or set prefixes. Use bare properties, or get foo() when a computed read is needed. getUserProfile() only when it does real work such as fetching or parsing
6. No I prefix on interfaces, no Impl suffix. Name the interface for the concept and the implementation for how it does it
7. No Abstract prefix
8. Prefer type over interface unless declaration merging is needed
9. Library aliasing: when two libraries occupy the same space, alias both. CodeMirror imports as CMView, ProseMirror as PMView. Never alias only one
10. The acronym rule does not apply to the deliberate library aliases above

## File Structure

1. More files with less LOC > 1 file with more LOC. If a component can be separated into sub components, prefer separating it into sub components
2. ~250 LOC is a soft benchmark, not a hard cap; lint warns at 400 effective lines (blank lines and comments excluded). Exceeding the benchmark is fine for files with easy to understand intentions such as a list of words or a super long map
3. When a file is split, break it into a folder named after the component. EditorToolbar/ holds EditorToolbar.svelte, EditorToolbar.types.ts, editorToolbarState.svelte.ts
4. Type definitions go into a type file, exception for super short files
5. UI goes into .svelte, pure logic stays in .ts or .svelte.ts. NEVER put more ts logic than needed to drive the UI in .svelte
6. Use .svelte.ts only when the file needs Svelte to process it, for instance when using runes. Plain .ts otherwise

## Code Structure

1. Declare constants at the very top of the file only, and in CAPS
2. Use functions instead of () => if possible. Exception: inline callbacks and anything passed directly as an argument
3. Immutable design as much as possible. Mutable creates unnecessary races
4. Return new values instead of editing arguments. No function should modify what it was given
5. Reactive collections are replaced, never mutated: build a fresh Map/Set/array and reassign it to the $state field. In-place mutation of a collection a template, $derived, or $effect reads is the one shape that goes stale silently

## View Lifecycle

Every rule here was paid for by the same bug: the editor blinking out and back on every file switch. Read them as one idea — an expensive view is a long lived shell that documents pass through, not a thing built per document.

1. Do not key an expensive view on the document it is showing. `{#key path}` reads as a tidy reset and compiles to destroy plus rebuild; for anything with per node views, measured layout, or a language server attached, that is the whole cost of opening the file, paid to arrive at a view identical to the one just discarded. Give the view a `load`/`swap` entry point and hand it the next document instead
2. Keep the key only when the reset IS the point, and say so in a comment. A form mid edit, or a pane that must never show the previous file's content under the new file's name, is reset correctly and for free by a key. That is a decision, not an oversight, and the next reader cannot tell the difference unless it is written down
3. A view that outlives its document must READ per document values, never capture them. Anything a long lived view closes over at construction — the document's directory, its path, its dialect — is frozen at the moment of the first document and silently wrong for the second. Pass `() => value`, not `value`. Svelte 5 props stay reactive inside a closure, so this costs nothing but the arrow
4. Never publish a hole. State that arrives in two writes — clear the old document, then install the new one — must land in ONE synchronous batch, or the render between them picks the empty branch and flashes a placeholder. Read first, publish together, at the end. The same rule applies to any pair a view reads as a unit: a diff's two sides, a document and its metadata
5. Cache what is expensive to derive, keyed by identity AND by the input it was derived from. A parse, a layout, a compile. The second key is what makes the entry safe: it turns "this file" into "this file, exactly as it reads right now", so a stale entry misses instead of serving a document that no longer matches the file. Bound it, and clear it where the identity dies (delete, rename, folder switch)
6. Prefer showing nothing to showing the previous document. Stale content under a new label is worse than an empty pane: it invites edits to the wrong file. Clear it, and keep the placeholder behind the delay in `lateReveal.ts` so a fast load shows nothing at all. Fix the blank by making the common case synchronous — rule 5 — not by leaving the old content up
7. An async result must be recorded against the input it came from, not against whatever the field holds when it resolves. `parsedFrom = currentText` on arrival marks text that was never parsed as parsed, and every fast path keyed on it then skips work it needed to do. Capture the input at the call, compare it on return, and drop the result if it was superseded

## Naming and Comments

1. File and folder names should be expressive enough that each file requires 0 top of the file comments. Top of the file comments should be avoided as much as possible
2. Function names should be descriptive. Do not use simple names like load, load what? Variable names should be just as clear
3. Comments should be avoided as much as possible. In most cases, if you need a comment, making that part of the code a separate function with a separate name is a better option
4. Exception: a comment explaining why is allowed when a function name cannot carry it. Workarounds, spec quirks, and performance tradeoffs qualify. Comments explaining what the code does do not
5. No section comments: no `// ---- x ----` banners, no divider lines, and no plain `// x` region labels either. A region worth labeling is worth being its own function or file. In markup the fix is extraction first: a component whose name says what the region is beats any comment (`<!-- toolbar -->` over a run of html is inferior to `<VisualEditorMathToolbar />`); failing that, a semantic element (`<section>`) over a labeled `<div>`
6. If you find yourself weighing whether a comment is needed, it is not
7. Names should be general such that they can be taken out of context and understood. If a name gets too long then it is doing too many things, so consider splitting. Lint rejects names past 50 characters:

```
units.ts // What units?
meterUnits.ts // This naming assumes the exports in meterUnits.ts will explain what specifically it does about meter units, otherwise the name should be more descriptive
meterUnitsConversion.ts // Better, in this case your exports should still be descriptive about what, for instance inchesToMeters

// module state
editorState // bad, what editor? what is editor? is editor a commonly established concept?
pmEditorState // better, it is about ProseMirror, but does it apply to all ProseMirror instances? what does it hold?
currentPMEditorView // great, it holds the live EditorView, this is a good name

// functions
run(command) // run what, on what?
runCommand(command) // better, but which system's commands, and what happens after?
runCMEditorCommand(command: CMCommand) // great, executes a CodeMirror command against the CM editor

// Folders. A folder is a package: one public entry file, internals enforced private by lint,
// like Java package-private

schema.ts // bad, one super long file, and schema of what? there are several PM schemas

languages/latex/schema/ // the LaTeX ProseMirror schema, split:
  latexPMSchema.ts // the public entry, builds and exports latexPMSchema. The entry's exports carry the full name, they travel out of the folder
  pmSchemaNodes.ts // internal. Dropping the latex prefix is allowed ONLY because lint bans importing internals from outside the folder
  pmSchemaMarks.ts // internal, same rule
```

## Modules and Errors

1. Named exports only. No default exports. Exception: Svelte components, which the compiler requires to be default
2. No barrel files. Import from the real file. If a folder needs one public entry point, that is a single named file, not an index.ts re-exporting everything
3. Return a result type for expected failures. Parse failures, 404s, and invalid user input are values the caller is supposed to handle, so put them in the signature
4. Throw for bugs. Null arguments and impossible states should surface loudly, not be handled
5. Tests mirror the source tree under tests/unit. src/lib/workspace/treeOps.ts is covered by tests/unit/lib/workspace/treeOps*.test.ts
6. Runes only, no stores. Module-level reactive values go through lib/runes (box for a writable value, observe for a subscription in a non-reactive scope); a third party library that hands you a store is adapted at the same edge

## Styling

The app is themed by swapping one Skeleton theme for another at runtime. Every rule here keeps that swap complete: a style that does not follow the theme is a style the next theme cannot change.

1. Colour, radius, spacing, border width and type scale come from the theme, never from literals. In markup that is the Skeleton utility: `bg-surface-200-800`, `text-primary-500`, `rounded-base`, `p-2`, `border`. In CSS it is the variable: `var(--color-primary-500)`, `var(--radius-base)`, `calc(var(--spacing) * 2)`, `var(--default-border-width)`. A hex, rgb, oklch or px value in a component is a bug: it survives a theme switch unchanged
2. A colour with a meaning of its own (a syntax role, a diff tint, a git state, a comment tint, the jump flash) is a Texpile token. Declare it in `texpile-default-theme.css` inside the `[data-theme='theme']` block, and give it a derivation from Skeleton's colour families in `src/texpile-tokens.css` so every other theme gets one too. Consumers name the token, never its value
3. Light and dark are a pairing, not a branch. `light-dark()` in CSS, the `{color}-{light}-{dark}` utilities in markup. No `.dark` selectors or `data-mode` checks in components
4. Code that hands colours to something outside CSS (xterm, the Typst preview page, the window title bar) reads them through `themeColour()` and re-reads when `themeName` or `resolvedMode` changes. Those are the only places a resolved colour value may exist
5. Font sizes go through the `text-*` utilities, which carry the theme's `--text-scaling`. Do not read `--text-xs` and friends directly
6. Secondary text is `text-muted`, disabled or placeholder text is `text-faint` (in CSS, `var(--muted-text)` and `var(--faint-text)`). Both are a share of the text colour, so they keep their distance from it on every theme. A mid step of the surface scale (`text-surface-500`, `text-surface-600-400`) is not a muted colour: a theme whose scale does not run light to dark puts it on top of the ground
7. A theme colour never goes straight onto the ground. As text or a thin mark it is `text-{family}-ink` (in CSS `var(--{family}-ink)`), whose lightness is clamped per mode so it reads on a pastel scale too. As a tint behind content it is `bg-{family}-500/15`, alpha over the ground. Text on a fill is Skeleton's `text-{family}-contrast-500`, never `text-white`. `text-primary-500` on a surface is the shape Reign turns invisible
8. Two radii, by what the box is. `rounded-base` is for controls that hold one line: buttons, inputs, chips, menu rows. `rounded-container` is for anything that holds content: cards, panels, popovers, menus, code boxes, and every textarea. A theme may set the base radius to a pill (Rosé Pine does), and a pill on a tall box swallows its corners
9. Skeleton's presets are the test: every one of them must render correctly with no changes. Something that looks wrong under a preset is fixed in the tokens, never with a special case for that theme

## Commit Messages

Format: `type(scope): subject`

Types:

1. `feat` — new user facing capability (pre-1.0.0 these ship as `fix`, matching the changelog)
2. `fix` — corrects broken behavior
3. `refactor` — restructures code, no behavior change
4. `test` — adds or changes tests only
5. `docs` — documentation only
6. `chore` — deps, config, tooling, build

Scopes are areas of the app: editor, workspace, electron, draft, collab, chrome, filetree. Omit the scope when a change spans the codebase.

Subject:

1. Imperative mood. add pricing table, not added or adds
2. Lowercase, no trailing period
3. Under 72 characters
4. Say what changed, not which files. fix selection across split blocks, not update resolveSelection.ts

Body, blank line after the subject, only when the why is not obvious. The diff shows what, the body explains why. Same rule as comments.

Breaking changes take a `!` before the colon and a `BREAKING CHANGE:` footer describing the migration:

    feat(editor)!: replace store API with runes

    BREAKING CHANGE: consumers passing a store to createEditor must pass a rune instead

## Merging

1. Squash merge every PR. Main keeps one commit per change, with a subject that follows the rules above
2. Local commits are scratch work. Commit as often as you like while developing, the squash discards them
3. The squash commit carries the final message. Breaking change footers must live there, not in an intermediate commit that gets thrown away
