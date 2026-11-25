// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { refuseDropOnGoneBlocks } from '$lib/editor/visual/extensions/goneBlocksRefuseDrop';
import { pmSuggestions, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { settleTestView } from '../../canvas/testing/testCanvasView';
import { createLaidOutTestView } from '../../canvas/testing/laidOutTestView';

const parsed = parseLatexFile('First paragraph.\n\nSecond paragraph.\n');

async function withGoneBlock(): Promise<CanvasView> {
	const plugin = refuseDropOnGoneBlocks();
	const view = createLaidOutTestView(EditorState.create({ doc: parsed.doc, plugins: [pmSuggestions(), plugin] }), { width: 600 });
	const removed = parsed.doc.type.schema.nodes.paragraph.create(null, parsed.doc.type.schema.text('Taken out.'));
	const join = parsed.doc.child(0).nodeSize;
	const range = {
		id: 'cut',
		from: join,
		to: join,
		restore: 'x',
		mine: true,
		old: [],
		partial: false,
		gone: { head: [], blocks: [removed], tail: [], depth: 0 }
	};
	setPmSuggestions(view as never, [range]);
	await settleTestView(view);
	return view;
}

function dragAt(view: CanvasView, y: number): DragEvent {
	const client = view.canvas.clientRect({ x: 20, y, width: 0, height: 0 });
	return new MouseEvent('drop', { clientX: client.left, clientY: client.top, cancelable: true }) as DragEvent;
}

describe('a drop on blocks a suggestion took out', () => {
	it('is refused where the canvas draws them, and taken elsewhere', async () => {
		const view = await withGoneBlock();
		const handlers = view.state.plugins.find((p) => p.props.handleDOMEvents)!.props.handleDOMEvents as Record<
			string,
			(v: never, e: DragEvent) => boolean
		>;
		let goneY = -1;
		for (let y = 0; y < 200 && goneY < 0; y += 2) {
			const hit = view.canvas.geometry.hit({ x: 20, y });
			if (hit?.chain[0]?.closest('.pm-suggest-gone')) goneY = y;
		}
		expect(goneY, 'the gone block takes room').toBeGreaterThan(0);

		const over = dragAt(view, goneY);
		expect(handlers.drop(view as never, over)).toBe(true);
		expect(over.defaultPrevented).toBe(true);
		handlers.dragover(view as never, dragAt(view, goneY));
		expect(document.documentElement.classList.contains('pm-drop-refused')).toBe(true);

		const elsewhere = dragAt(view, 2);
		expect(handlers.drop(view as never, elsewhere)).toBe(false);
		handlers.dragover(view as never, dragAt(view, 2));
		expect(document.documentElement.classList.contains('pm-drop-refused')).toBe(false);
		view.destroy();
	});
});
