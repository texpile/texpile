// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { FaceElement } from '$lib/editor/canvas';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { openTypstEnvHead } from '$lib/languages/typst/visual/extensions/env/typstEnvHead';
import { typstLayoutViews } from '$lib/languages/typst/visual/extensions/layout/canvas/typstLayoutViews';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

const SRC = '#lemma(title: "Zorn")[\n  Every chain has a bound.\n] <lem:zorn>\n\nBy @lem:zorn.\n';
const place = () => ({ x: 10, y: 10, width: 40, height: 20 });

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

function open() {
	const parsed = parseTypstFile(SRC);
	const view = createTestCanvasView(EditorState.create({ doc: parsed.doc }), {
		props: { language: 'typst', nodeViews: typstLayoutViews().nodeViews }
	});
	return { parsed, view };
}

describe('a Typst environment on the canvas', () => {
	it('names its call and label above the body', () => {
		const { view } = open();
		const root = view.nodeDOM(0) as unknown as FaceElement;
		expect(root.querySelector('.env-label')?.textContent).toBe('lemma');
		expect(root.querySelector('.typ-env-label')?.textContent).toBe('<lem:zorn>');
		expect(root.querySelector('.typ-environment-body')?.hole).toBe(true);
		view.destroy();
	});

	it('writes a head edit into the call alone, and a label rename into its references', () => {
		const { parsed, view } = open();
		openTypstEnvHead(view, 0, place);
		expect(chipPanel.request!.source).toBe('#lemma(title: "Zorn") <lem:zorn>');
		chipPanel.request!.write('#lemma(title: "Zor');
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC);
		chipPanel.request!.write('#lemma(title: "Kuratowski") <lem:max>');
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(
			SRC.replace('"Zorn"', '"Kuratowski"').replace('<lem:zorn>', '<lem:max>').replace('@lem:zorn', '@lem:max')
		);
		view.destroy();
	});

	it('takes the references along when the label is retyped whole', () => {
		const { parsed, view } = open();
		openTypstEnvHead(view, 0, place);
		chipPanel.request!.write('#lemma(title: "Zorn") ');
		chipPanel.request!.write('#lemma(title: "Zorn") <lem:m>');
		expect(serializeTypstFile(parsed, view.state.doc)).toContain('By @lem:m.');
		view.destroy();
	});
});
