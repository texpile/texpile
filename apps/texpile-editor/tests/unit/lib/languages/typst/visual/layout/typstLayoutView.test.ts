// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstDrawnEnvView } from '$lib/languages/typst/visual/extensions/layout/typstEnvViews';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';

const SRC = '#align(center)[Centered.]\n\n#block(fill: luma(230), inset: 8pt)[A block.]\n\n#quote(attribution: [Ann])[Said so.]\n';

let view: EditorView | null = null;
beforeEach(() => {
	// the panel places itself against its anchor; jsdom lays nothing out
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});
afterEach(() => {
	view?.destroy();
	view = null;
	document.body.innerHTML = '';
});

function open(src: string) {
	const parsed = parseTypstFile(src);
	view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: parsed.doc }),
		nodeViews: { typ_env: (node, v, getPos) => typstDrawnEnvView(node, v, getPos) }
	});
	flushSync();
	return { parsed, view };
}

describe('a layout call in the editor', () => {
	it('draws the alignment, the fill and the inset, and saves untouched byte for byte', () => {
		const { parsed, view } = open(SRC);
		const [align, block, quote] = [...document.querySelectorAll<HTMLElement>('.typ-layout')];
		expect(align.style.textAlign).toBe('center');
		expect(block.style.background).toBe('rgb(230, 230, 230)');
		expect(block.style.padding).toBe('8pt');
		expect(quote.querySelector('.typ-layout-attribution')!.textContent).toBe('- Ann');
		expect(document.querySelector('.typ-environment')).toBeNull();
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC);
	});

	it('changes only its own call from the settings', () => {
		const { parsed, view } = open(SRC);
		document.querySelector<HTMLButtonElement>('.typ-layout-gear button')!.click();
		chipPanel.request!.writeSetting('#align(right)');
		flushSync();
		expect(document.querySelector<HTMLElement>('.typ-layout')!.style.textAlign).toBe('right');
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC.replace('align(center)', 'align(right)'));
	});
});
