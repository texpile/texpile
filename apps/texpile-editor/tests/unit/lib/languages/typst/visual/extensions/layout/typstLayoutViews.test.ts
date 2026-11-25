// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { FaceElement } from '$lib/editor/canvas';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { LAYOUT_SETTINGS } from '$lib/languages/typst/visual/extensions/layout/canvas/layoutSettingsOffer';
import { typstLayoutViews } from '$lib/languages/typst/visual/extensions/layout/canvas/typstLayoutViews';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

const SRC = '#align(center)[Centered.]\n\n#block(fill: luma(230), inset: 8pt)[A block.]\n\n#quote(attribution: [Ann])[Said so.]\n';

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
	const layouts = (): FaceElement[] => {
		const found: FaceElement[] = [];
		view.state.doc.forEach((_node, pos) => found.push(view.nodeDOM(pos) as unknown as FaceElement));
		return found;
	};
	return { parsed, view, layouts };
}

describe('a layout call on the canvas', () => {
	it('draws the alignment, the fill, the inset and the attribution, and saves untouched byte for byte', () => {
		const { parsed, view, layouts } = open();
		const [align, block, quote] = layouts();
		expect(align.style.getPropertyValue('text-align')).toBe('center');
		expect(block.style.getPropertyValue('padding')).toBe('8pt');
		expect(quote.querySelector('.typ-layout-attribution')?.textContent).toBe('- Ann');
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC);
		view.destroy();
	});

	it('changes only its own call from the settings', () => {
		const { parsed, view, layouts } = open();
		LAYOUT_SETTINGS.open(0, view, new DOMRect(10, 10, 20, 20));
		chipPanel.request!.writeSetting('#align(right)');
		expect(layouts()[0].style.getPropertyValue('text-align')).toBe('right');
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC.replace('align(center)', 'align(right)'));
		view.destroy();
	});
});
