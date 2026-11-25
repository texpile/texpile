// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { referenceStore } from '$lib/stores/editorStore';
import { createTestCanvasView } from '../../../canvas/testing/testCanvasView';

afterEach(() => {
	referenceStore.current = null;
});

it('\\printbibliography draws its heading and the references of the .bib', () => {
	referenceStore.current = [
		{ key: 'b', author: 'Zed, Z.', year: '2020', title: 'Last' },
		{ key: 'a', author: 'Ann, A.', year: '2019', title: 'First' }
	] as never;
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text('\\printbibliography'))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: latexNodeViews({ imageDir: () => '' }) });
	const card = (view.nodeDOM(0) as unknown as HTMLElement).querySelector('.bibliography-preview');
	expect(card?.querySelector('h2')?.textContent).toBe('References');
	expect([...(card?.querySelectorAll('.bibliography-entry') ?? [])].map((p) => p.textContent?.slice(0, 7))).toEqual(['Ann, A.', 'Zed, Z.']);
	// as document.css set them over the DOM card's own classes: an editor h2, a paragraph's bottom margin
	expect(card?.querySelector('h2')?.style.fontSize).toBe('calc(var(--text-base) * 1.2)');
	expect((card?.querySelector('.bibliography-entry') as HTMLElement | null)?.style.margin).toBe('0 0 calc(var(--spacing) * 3)');
});
