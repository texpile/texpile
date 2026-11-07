import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { subsuperscriptCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/subsuperscript';

function completeAt(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc });
	return subsuperscriptCompletionSource(new CompletionContext(state, pos, false));
}
const labels = (r: ReturnType<typeof completeAt>) => (r?.options ?? []).map((o) => o.label);

describe('subscript/superscript reuse completion', () => {
	it('offers a subscript already used elsewhere in the document', () => {
		const doc = 'x_{i,j} + y_{i';
		expect(labels(completeAt(doc))).toContain('i,j');
	});

	it('keeps subscripts and superscripts in separate pools', () => {
		const doc = 'x_{alpha} + y^{a';
		expect(labels(completeAt(doc))).not.toContain('alpha'); // alpha was a SUBscript, this is a SUPerscript slot
	});

	it('offers a superscript already used elsewhere', () => {
		const doc = 'x^{2} + y^{2';
		expect(labels(completeAt(doc))).toContain('2');
	});

	it('mines a nested script whole, and offers nothing after a caret with no brace', () => {
		expect(labels(completeAt('x^{\\mathrm{T}} + y^{'))).toContain('\\mathrm{T}');
		expect(completeAt('x^{2} + y^')).toBeNull();
	});

	it('returns nothing when nothing matches the trigger', () => {
		expect(completeAt('plain text')).toBeNull();
	});
});
