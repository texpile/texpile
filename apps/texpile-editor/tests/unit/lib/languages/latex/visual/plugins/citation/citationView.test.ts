// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import type { FaceElement, VisualView } from '$lib/editor/canvas';
import { buildHelpersOf, PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import { citationView } from '$lib/languages/latex/visual/plugins/citation/citationView';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { referenceStore } from '$lib/stores/editorStore';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };
const cite = (key: string) => schema.nodes.citation.create({ variant: 'cite' }, schema.text(key));

function build(node: PMNode): FaceElement {
	const tools = buildHelpersOf({
		view: {} as VisualView,
		language: 'latex',
		editable: true,
		settings: SETTINGS,
		schema,
		counters: { at: () => 0 },
		media: PLAIN_FACE_MEDIA,
		record: () => {}
	});
	const view = { editable: true, state: {}, canvas: { build: tools } } as unknown as VisualView;
	return inBuild(tools, () => citationView(node, view, () => 0, [], DecorationSet.empty)).dom as FaceElement;
}

afterEach(() => {
	referenceStore.current = null;
});

it('draws a key no bibliography holds in red as not found', () => {
	referenceStore.current = [];
	const root = build(cite('key1'));
	expect(root.textContent).toBe('(key1 not found)');
	expect(root.style.getPropertyValue('color')).toBe('var(--color-ref-broken-fg)');
});

it('draws a key the bibliography holds as its citation, in the reference color', () => {
	referenceStore.current = [{ key: 'key1', author: 'Knuth, Donald', year: '1984' } as unknown as BiblatexReference];
	const root = build(cite('key1'));
	expect(root.textContent).not.toContain('key1');
	expect(root.style.getPropertyValue('color')).toBe('var(--color-ref-fg)');
});
