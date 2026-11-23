// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import type { FaceElement } from '$lib/editor/canvas';
import { referenceStore } from '$lib/stores/editorStore';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { refNumbersPlugin } from '$lib/languages/typst/visual/plugins/ref/node/refNumbers.svelte';
import { typstRefCanvasView } from '$lib/languages/typst/visual/plugins/ref/node/typstRefCanvasView';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

afterEach(() => (referenceStore.current = null));

it('a reference reads as its citation once the bibliography is in, and as written before', () => {
	const doc = parseTypstFile('See @knuth84[p. 7] and @sec:intro.\n').doc;
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [refNumbersPlugin] }), {
		props: { language: 'typst', nodeViews: { typ_ref: typstRefCanvasView((source) => parseTypstFile(source).doc) } }
	});
	const chips = (): string[] => {
		const found: string[] = [];
		view.state.doc.descendants((node, pos) => {
			if (node.type.name === 'typ_ref') found.push((view.nodeDOM(pos) as unknown as FaceElement).textContent);
		});
		return found;
	};
	expect(chips()).toEqual(['@knuth84[p. 7]', '@sec:intro']);
	referenceStore.current = [{ key: 'knuth84', entrytype: 'book', author: 'Knuth, Donald E.', year: '1984' }];
	flushSync();
	expect(chips()).toEqual(['(Knuth 1984, p. 7)', '@sec:intro']);
	view.destroy();
});
