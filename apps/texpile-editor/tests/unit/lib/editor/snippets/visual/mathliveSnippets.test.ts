// snippets as the visual editor's LaTeX equations take them: each stop an empty slot, the auto ones
// as inline shortcuts, and every one a row of the math search
import { describe, expect, it } from 'vitest';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';
import { mathLiveShortcuts, snippetStructures, typstShortcuts } from '$lib/editor/snippets/visual/mathliveSnippets';

const FILE = `{ "snippets": {
	"Definite integral": { "prefix": "dint", "context": "math", "auto": true, "body": "\\\\int_{\${1:0}}^{\${2:1}} $3 \\\\, \\\\mathrm{d}\${4:x}$0" },
	"Subscript": { "prefix": "([a-z])(\\\\d)", "regex": true, "auto": true, "context": "math", "body": "[[0]]_{[[1]]}" },
	"Text only": { "prefix": "tx", "context": "text", "auto": true, "body": "x" },
	"Typst integral": { "prefix": "tint", "context": "math", "auto": true, "body": { "typst": "integral_(\${1:0})^(\${2:1}) $3 dif \${4:x}$0" } }
} }`;

describe('snippets in visual equations', () => {
	setSnippetLayers({ global: parseSnippetFile(FILE, 'global'), project: null, allowedPatterns: null });

	it('makes an auto snippet an inline shortcut with a slot per stop, leaving patterns and text ones out', () => {
		const shortcuts = mathLiveShortcuts();
		expect(shortcuts.dint).toBe('\\int_{#?}^{#?} #? \\, \\mathrm{d}#?');
		expect(Object.keys(shortcuts)).toEqual(['dint']);
	});

	it('lists every math snippet in the search, found by its trigger', () => {
		const rows = snippetStructures('latex');
		expect(rows.find((s) => s.words.includes('dint'))?.latex).toBe('\\int_{#?}^{#?} #? \\, \\mathrm{d}#?');
		expect(rows.some((s) => s.label.startsWith('@/'))).toBe(true);
	});

	it('gives a Typst equation the Typst body with its defaults, Typst source having no slots', () => {
		expect(typstShortcuts().tint).toEqual({ value: 'integral_(0)^(1)  dif x', format: 'typst' });
	});
});
