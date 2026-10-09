Client-side spell and grammar check via Harper.js (WASM), wired into ProseMirror through prosemirror-proofread.
linter.ts wraps the WorkerLinter and the custom dictionary; SuggestionBox.svelte is the suggestion popup.
languages/ checks the other languages: CSpell dictionaries built by scripts/spellDictionaries.ts, read in a worker.
