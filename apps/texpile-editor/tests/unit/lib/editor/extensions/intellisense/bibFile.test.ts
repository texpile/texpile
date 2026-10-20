import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { bibFileCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/bibFile';

function completeAt(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc });
	return bibFileCompletionSource(new CompletionContext(state, pos, false));
}
const labels = (r: ReturnType<typeof completeAt>) => (r?.options ?? []).map((o) => o.label);

describe('.bib source-mode completion', () => {
	it('completes entry types after "@"', () => {
		const r = completeAt('@art');
		expect(labels(r)).toContain('@article');
	});

	it('an accepted entry type snippet is pre-sized to its required fields', () => {
		const r = completeAt('@article');
		const article = r?.options.find((o) => o.label === '@article');
		expect(typeof article?.apply).toBe('function');
	});

	it('offers optional fields on a bare line inside a known entry', () => {
		const doc = '@article{key2020,\n\tauthor = {Someone},\n\ttitle = {A Title},\n\tjournaltitle = {J},\n\tyear = {2020},\n\t';
		const r = completeAt(doc);
		// volume/number/pages/doi are optional for @article and not already typed
		expect(labels(r)).toContain('volume');
		expect(labels(r)).not.toContain('author'); // already required/typed, not offered again
	});

	it('offers no fields or values between entries, where BibTeX reads a comment', () => {
		const doc = '@book{sample,\n  publisher = {Example Press},\n  year      = {2024}\n}\n';
		expect(completeAt(`${doc}ab`)).toBeNull();
		expect(completeAt(`${doc}publisher = {Ex`)).toBeNull();
	});

	it('offers previously-used values for the same field elsewhere in the file', () => {
		const doc = '@article{a,\n\tpublisher = {Springer},\n}\n@article{b,\n\tpublisher = {Spr}\n}';
		const cursorPos = doc.lastIndexOf('{Spr') + '{Spr'.length; // the SECOND "{Spr" (the one being typed), not "{Springer}"'s own prefix
		const r = completeAt(doc, cursorPos);
		expect(labels(r)).toContain('Springer');
	});

	it('a BibTeX type biblatex reads as another takes its fields', () => {
		expect(labels(completeAt('@phd'))).toContain('@phdthesis');
		expect(labels(completeAt('@phdthesis{k,\n\tauthor = {A},\n\t'))).toContain('location');
	});

	it('returns nothing for plain prose', () => {
		expect(completeAt('this is not a bib file')).toBeNull();
	});
});
