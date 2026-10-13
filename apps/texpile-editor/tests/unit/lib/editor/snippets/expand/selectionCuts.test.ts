// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { cutsThroughSyntax } from '$lib/editor/snippets/expand/selectionCuts';

/** `|…|` marks the selection */
function cuts(marked: string): boolean {
	const from = marked.indexOf('|');
	const to = marked.indexOf('|', from + 1) - 1;
	const doc = marked.replace(/\|/g, '');
	const state = EditorState.create({ doc, extensions: [typstLanguage()] });
	ensureSyntaxTree(state, doc.length, 5000);
	return cutsThroughSyntax(state, from, to, 'typst');
}

describe('a Typst selection that would break markup when wrapped', () => {
	it('is refused when it holds one delimiter of a pair, from either side', () => {
		expect(cuts('see |*bol|d* and')).toBe(true);
		expect(cuts('see *b|old*| and')).toBe(true);
		expect(cuts('see *bo|ld* and|')).toBe(true);
		expect(cuts('|$x| + y$')).toBe(true);
	});

	it('is allowed whole, inside, or across plain text', () => {
		expect(cuts('see |*bold*| and')).toBe(false);
		expect(cuts('see *b|ol|d* and')).toBe(false);
		expect(cuts('$|x +| y$')).toBe(false);
		expect(cuts('= Title |here|')).toBe(false);
		expect(cuts('|see some| words')).toBe(false);
	});
});
