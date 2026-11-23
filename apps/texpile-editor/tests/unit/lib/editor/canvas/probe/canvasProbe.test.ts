// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { CanvasProbe } from '$lib/editor/canvas';
import { createTestCanvasView, settleTestView, testSchema } from '../testing/testCanvasView';

function windowProbe(): CanvasProbe {
	return (window as Window & { __canvasProbe?: CanvasProbe }).__canvasProbe!;
}

function stateOf(...texts: string[]): EditorState {
	const blocks = texts.map((t) => testSchema.node('paragraph', null, [testSchema.text(t)]));
	return EditorState.create({ doc: testSchema.node('doc', null, [...blocks, testSchema.node('image', { label: 'fig:a' })]) });
}

describe('window.__canvasProbe', () => {
	it('lists every mounted editor, the focused one active, and forgets a destroyed one', () => {
		const left = createTestCanvasView(stateOf('left'), { probe: { pane: 'left', path: 'main.tex' } });
		const right = createTestCanvasView(stateOf('right'), { probe: { pane: 'right', path: 'intro.tex' } });
		expect(
			windowProbe()
				.views()
				.map((v) => `${v.pane} ${v.path} ${v.language}`)
		).toEqual(['left main.tex latex', 'right intro.tex latex']);
		expect(windowProbe().active()?.pane).toBe('right');
		left.focus();
		expect(left.hasFocus()).toBe(true);
		expect(windowProbe().active()?.pane).toBe('left');
		right.destroy();
		expect(
			windowProbe()
				.views()
				.map((v) => v.pane)
		).toEqual(['left']);
		left.destroy();
		expect(windowProbe().active()).toBeNull();
	});

	it('answers frame stats, face queries and draw lists from the model and the layout', async () => {
		const view = createTestCanvasView(stateOf('alpha', 'beta'), { probe: { pane: 'main', path: 'paper.tex' } });
		await settleTestView(view);
		const probe = windowProbe().active()!;
		view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
		await settleTestView(view);
		const stats = probe.frameStats();
		expect(stats.frames).toBeGreaterThanOrEqual(2);
		expect(stats.keyToFrameMs).toHaveLength(1);
		const imagePos = view.state.doc.content.size - 1;
		expect(probe.query('.imagePluginRoot')).toEqual([
			expect.objectContaining({
				tag: 'div',
				classes: ['imagePluginRoot'],
				attrs: { class: 'imagePluginRoot', 'imageplugin-label': 'fig:a' },
				pos: imagePos
			})
		]);
		expect(probe.posOf('beta')).toBe(view.state.doc.child(0).nodeSize + 1);
		expect(probe.drawList(probe.posOf('beta')).map((op) => `${op.op} ${op.text ?? ''}`.trim())).toEqual(['fillRect', 'fillText beta']);
		expect(probe.errors()).toEqual([]);
		view.destroy();
	});
});
