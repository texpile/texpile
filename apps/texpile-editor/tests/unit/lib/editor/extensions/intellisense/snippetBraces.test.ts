// CodeMirror's snippet parser turns `\{` into a bare `{`, so every literal brace pair in a snippet
// has to be written `\\{`; `\left{` used to insert `\left{\right}` and `\{` inserted `{}`.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { snippet } from '@codemirror/autocomplete';
import { MACRO_FORMS } from '$lib/languages/latex/intellisense/data/macroForms';
import { BUILTIN_SNIPPETS } from '$lib/editor/snippets/file/builtinSnippets';
import { toCmInsertion } from '$lib/editor/snippets/expand/body/cmInsertion';

const NO_INPUTS = { selection: '', captures: [] };

function inserted(template: string): string {
	let state = EditorState.create({ doc: '' });
	snippet(template)({ state, dispatch: (tr) => (state = tr.state) }, null, 0, 0);
	return state.doc.toString();
}

describe('snippet braces', () => {
	it.each([
		['left{', '\\left\\{\\right\\}'],
		['{', '\\{\\}'],
		['bigl\\{', '\\bigl\\{\\bigr\\}']
	])('\\%s inserts %s', (label, text) => {
		const m = MACRO_FORMS.find((x) => x.label === label);
		expect(m?.snippet).toBeTruthy();
		expect(inserted('\\' + m!.snippet!)).toBe(text);
	});

	it('the @{ snippet inserts escaped braces', () => {
		const s = BUILTIN_SNIPPETS.find((x) => x.name === '@{');
		expect(toCmInsertion(s!.bodies.latex!, NO_INPUTS, { base: '', unit: '  ' }).text).toBe('\\left\\{  \\right\\}');
	});

	it('no template built from the tables carries a brace the parser would strip', () => {
		// the macro builder prepends the backslash
		const templates = MACRO_FORMS.map((x) => '\\' + x.snippet);
		const stripped = templates.filter((t) => /(?<!\\)\\[{}]/.test(t));
		expect(stripped).toEqual([]);
	});
});
