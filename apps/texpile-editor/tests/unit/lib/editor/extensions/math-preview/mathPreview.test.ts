import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { showTooltip } from '@codemirror/view';
import { mathPreview } from '$lib/editor/source/extensions/math-preview/mathPreview';

function previewAt(doc: string, inside: string, comments?: boolean): boolean {
	const state = EditorState.create({
		doc,
		selection: { anchor: doc.indexOf(inside) + 1 },
		extensions: mathPreview(comments === undefined ? {} : { comments })
	});
	return state.facet(showTooltip).some(Boolean);
}

describe('the source math preview', () => {
	it('reads a percent sign in Markdown as text, not as the start of a comment', () => {
		expect(previewAt('Up 50% since $x^2$ was set.', 'x^2', false)).toBe(true);
		expect(previewAt('Up 50% since $x^2$ was set.', 'x^2')).toBe(false);
	});
});
