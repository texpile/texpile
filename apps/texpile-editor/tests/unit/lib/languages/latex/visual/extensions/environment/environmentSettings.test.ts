// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import { openEnvironmentHead } from '$lib/languages/latex/visual/extensions/environment/canvas/environmentSettings';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

const n = schema.nodes;

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});
const place = () => ({ x: 10, y: 10, width: 40, height: 20 });

function openLemma() {
	const doc = n.doc.create(null, [n.environment.create({ name: 'lemma', args: '[Zorn]' }, n.paragraph.create(null, schema.text('Body.')))]);
	const view = createTestCanvasView(EditorState.create({ doc }));
	openEnvironmentHead(view, 0, place);
	return view;
}

describe('an environment head in the chip panel', () => {
	it('opens as LaTeX and sets the name and arguments once they read as a head', () => {
		const view = openLemma();
		expect(chipPanel.request!.source).toBe('\\begin{lemma}[Zorn]');
		chipPanel.request!.write('\\begin{claim}[Kuratowski]{x}');
		expect(view.state.doc.firstChild!.attrs).toMatchObject({ name: 'claim', args: '[Kuratowski]{x}' });
		view.destroy();
	});

	it('writes nothing while the head is half typed', () => {
		const view = openLemma();
		chipPanel.request!.write('\\begin{claim}[Kurat');
		chipPanel.request!.write('\\begin{cla');
		expect(view.state.doc.firstChild!.attrs).toMatchObject({ name: 'lemma', args: '[Zorn]' });
		view.destroy();
	});
});
