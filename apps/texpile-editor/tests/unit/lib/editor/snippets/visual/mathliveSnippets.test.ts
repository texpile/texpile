import { beforeAll, describe, expect, it } from 'vitest';
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
	beforeAll(() => setSnippetLayers({ global: parseSnippetFile(FILE, 'global'), project: null, allowedPatterns: null }));

	it('makes an auto snippet an inline shortcut with a slot per stop, leaving patterns and text ones out', () => {
		const shortcuts = mathLiveShortcuts(false);
		expect(shortcuts.dint).toBe('\\int_{#?}^{#?} #? \\, \\mathrm{d}#?');
		expect(Object.keys(shortcuts)).toEqual(['dint']);
	});

	it('lists the math snippets of the files in the search, found by their trigger', () => {
		const rows = snippetStructures('latex', false);
		expect(rows.find((s) => s.words.includes('dint'))?.latex).toBe('\\int_{#?}^{#?} #? \\, \\mathrm{d}#?');
		expect(rows.some((s) => s.label.startsWith('@'))).toBe(false);
	});

	it('gives a Typst equation the Typst body with its defaults, a place without one a slot', () => {
		expect(typstShortcuts(false).tint).toEqual({ value: 'integral_(0)^(1) #? dif x', format: 'typst' });
	});
});

const math = (body: { latex?: string; typst?: string }, context = 'math') => ({ prefix: 'm', context, auto: true, body });
const PLACES = JSON.stringify({
	snippets: {
		pair: { ...math({ latex: '${1:x}+$1', typst: 'f(${1:x}) = $1^2' }), prefix: 'mpair' },
		choice: { ...math({ typst: '${1|vec,mat|}($2) + $1(a)' }), prefix: 'mvec' },
		frac: { ...math({ latex: '\\frac{${1:\\frac{a}{b}}}{$2}', typst: 'frac($1, $2)' }), prefix: 'mfrac' },
		zero: { ...math({ latex: '\\left( $0 \\right)', typst: 'lr(( $0 ))' }), prefix: 'mzero' },
		inline: { ...math({ latex: 'I', typst: 'I' }, 'inline-math'), prefix: 'minl' },
		display: { ...math({ latex: 'D', typst: 'D' }, 'display-math'), prefix: 'mdisp' }
	}
});

describe('places in visual equations', () => {
	beforeAll(() => setSnippetLayers({ global: parseSnippetFile(PLACES, 'global'), project: null, allowedPatterns: null }));

	it('keeps a LaTeX slot per place, later copies starting as its default, $0 a slot and braces balanced', () => {
		const shortcuts = mathLiveShortcuts(false);
		expect([shortcuts.mpair, shortcuts.mfrac, shortcuts.mzero]).toEqual(['#?+x', '\\frac{\\frac{a{b}}}{#?}', '\\left( #? \\right)']);
	});

	it('fills every copy of a Typst place with its default, and makes an empty place or $0 a slot', () => {
		const values = ['mpair', 'mvec', 'mfrac', 'mzero'].map((p) => typstShortcuts(false)[p].value);
		expect(values).toEqual(['f(x) = x^2', 'vec(#?) + vec(a)', 'frac(#?, #?)', 'lr(( #? ))']);
	});

	it('offers inline-math snippets in inline equations only, and display-math ones in display equations', () => {
		const keys = (display: boolean) =>
			[mathLiveShortcuts(display), typstShortcuts(display)].map((s) => ['minl', 'mdisp'].filter((k) => k in s));
		expect([keys(false), keys(true)]).toEqual([
			[['minl'], ['minl']],
			[['mdisp'], ['mdisp']]
		]);
	});
});
