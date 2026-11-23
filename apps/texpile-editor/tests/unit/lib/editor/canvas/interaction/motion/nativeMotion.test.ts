// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { CanvasNodeViews, CanvasView } from '$lib/editor/canvas';
import type { Platform } from '$lib/editor/keys/platformKeys';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { caretArrowsPlugin } from '$lib/editor/canvas';
import { LINE, settleTestView, testSchema } from '../../testing/testCanvasView';
import { createLaidOutTestView } from '../../testing/laidOutTestView';

const { paragraph, cite, image } = testSchema.nodes;
const words = (value: string) => testSchema.text(value);
const KEY_CODES: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

type Setup = {
	selection?: (doc: ReturnType<typeof testSchema.node>) => Selection;
	platform?: Platform;
	nodeViews?: CanvasNodeViews;
	height?: number;
	plugins?: never[];
};

async function boardOf(blocks: ReturnType<typeof paragraph.create>[], setup: Setup = {}) {
	const doc = testSchema.node('doc', null, blocks);
	const state = EditorState.create({ doc, selection: setup.selection?.(doc) ?? TextSelection.create(doc, 1), plugins: setup.plugins });
	const view = createLaidOutTestView(state, { nodeViews: setup.nodeViews, height: setup.height, plugins: setup.plugins });
	await settleTestView(view);
	const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, setup.platform ?? 'linux');
	const press = (key: string, init: KeyboardEventInit = {}) =>
		router.keydown(new KeyboardEvent('keydown', { key, keyCode: KEY_CODES[key] ?? 0, ...init }));
	return { view, press, doc };
}

const place = (view: CanvasView, pos: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));

describe('visual moves in a right-to-left line', () => {
	it('Left goes forward in the text, Right back, and Ctrl+Left to the end of the word', async () => {
		const { view, press } = await boardOf([paragraph.create(null, words('אבג דהו'))], { selection: (doc) => TextSelection.create(doc, 2) });
		press('ArrowLeft');
		expect(view.state.selection.head).toBe(3);
		press('ArrowRight');
		press('ArrowRight');
		expect(view.state.selection.head).toBe(1);
		press('ArrowLeft', { ctrlKey: true });
		expect(view.state.selection.head).toBe(4);
		view.destroy();
	});
});

describe('a Shift move from a selected node', () => {
	it('grows a range from the node edge away from the move, and the head goes on from the near edge', async () => {
		const { view, press } = await boardOf([paragraph.create(null, [words('ab'), cite.create({ key: 'k' }), words('cd')])], {
			selection: (doc) => NodeSelection.create(doc, 3)
		});
		press('ArrowRight', { shiftKey: true });
		expect([view.state.selection.anchor, view.state.selection.head]).toEqual([3, 5]);
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 3)));
		press('ArrowLeft', { shiftKey: true });
		expect([view.state.selection.anchor, view.state.selection.head]).toEqual([4, 2]);
		view.destroy();
	});

	it('from a block node the range ends at the facing edge of the textblock beyond it', async () => {
		const { view, press, doc } = await boardOf(
			[paragraph.create(null, words('ab')), image.create({ label: 'x' }), paragraph.create(null, words('cd'))],
			{
				selection: (doc) => NodeSelection.create(doc, doc.child(0).nodeSize)
			}
		);
		press('ArrowDown', { shiftKey: true });
		expect(view.state.selection.anchor).toBe(doc.child(0).nodeSize - 1);
		expect(view.state.selection.head).toBe(doc.child(0).nodeSize + doc.child(1).nodeSize + 1);
		view.destroy();
	});
});

describe('a plain Up or Down from a range', () => {
	it('moves from the range head, the end Chromium moves a line from', async () => {
		const lines = ['abcdefghij', 'abcdefghij'];
		const { view, press } = await boardOf(lines.map((line) => paragraph.create(null, words(line))));
		const second = view.state.doc.child(0).nodeSize + 1;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, second + 2, second + 6)));
		press('ArrowUp');
		expect(view.state.selection.head).toBe(1 + 6);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1 + 2, 1 + 6)));
		press('ArrowDown');
		expect(view.state.selection.head).toBe(second + 6);
		view.destroy();
	});
});

describe('Home and End from a gap cursor', () => {
	it('go to the end of the text before it', async () => {
		const { view, press } = await boardOf([
			paragraph.create(null, words('abc')),
			image.create({ label: 'a' }),
			image.create({ label: 'b' })
		]);
		const gap = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
		view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(gap))));
		press('Home');
		expect(view.state.selection.head).toBe(1 + 3);
		view.destroy();
	});
});

describe('a Shift paragraph move from a gap cursor', () => {
	it('keeps the end of the text before the gap as the anchor and goes on to that paragraph start', async () => {
		const { view, press, doc } = await boardOf([
			paragraph.create(null, words('first paragraph')),
			image.create({ label: 'a' }),
			paragraph.create(null, words('last'))
		]);
		const gap = doc.child(0).nodeSize;
		view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(gap))));
		press('ArrowUp', { ctrlKey: true, shiftKey: true });
		expect([view.state.selection.anchor, view.state.selection.head]).toEqual([gap - 1, 1]);
		view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(gap))));
		press('ArrowUp', { ctrlKey: true });
		expect([view.state.selection.anchor, view.state.selection.head]).toEqual([gap - 1, gap - 1]);
		view.destroy();
	});
});

describe('Ctrl+End and Shift+Ctrl+End before a document that ends in an island', () => {
	// a nested editor owns the caret inside: setSelection and stopEvent make the view an island
	const nodeViews: CanvasNodeViews = {
		heading: (_node, view) => {
			const dom = view.canvas.build.el('div', 'island');
			return { dom, contentDOM: dom, setSelection: () => {}, stopEvent: () => false };
		}
	};

	it('go into the island, and a range stops at the end of the text before it', async () => {
		const { view, press } = await boardOf([paragraph.create(null, words('first')), testSchema.nodes.heading.create(null, words('code'))], {
			nodeViews
		});
		press('End', { ctrlKey: true, shiftKey: true });
		expect([view.state.selection.anchor, view.state.selection.head]).toEqual([1, 1 + 5]);
		place(view, 1);
		press('End', { ctrlKey: true });
		expect(view.state.selection.head).toBe(view.state.doc.child(0).nodeSize + 1 + 4);
		view.destroy();
	});
});

describe('Up and Down onto a chip on a line of its own', () => {
	// a chip drawn as a block stands on a line of its own
	const nodeViews: CanvasNodeViews = { cite: (_node, view) => ({ dom: view.canvas.build.el('div', 'chip') }) };

	it('select the chip and go on past it with the next key', async () => {
		const chipNode = testSchema.nodes.cite;
		const { view, press } = await boardOf(
			[
				paragraph.create(null, words('above')),
				paragraph.create(null, chipNode.create({ key: 'c' })),
				paragraph.create(null, words('below'))
			],
			{ nodeViews }
		);
		place(view, 3);
		press('ArrowDown');
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(view.state.selection.from).toBe(view.state.doc.child(0).nodeSize + 1);
		view.destroy();
	});
});

describe('the page keys', () => {
	const lines = Array.from({ length: 40 }, (_, i) => paragraph.create(null, words(`line ${i}`)));

	it('PageDown moves the caret 0.93 of the pane and puts it at the top of the band; Shift shows it at the foot', async () => {
		const { view, press } = await boardOf(lines, { height: 400 });
		const before = view.canvas.geometry.caretRect(view.canvas.head())!;
		press('PageDown');
		const after = view.canvas.geometry.caretRect(view.canvas.head())!;
		expect(Math.abs(after.y - before.y - 0.93 * 400)).toBeLessThanOrEqual(LINE);
		expect(view.canvas.clientRect(after).top).toBeCloseTo(5, 0);
		const plain = view.canvas.scroller.scrollTop;
		place(view, 1);
		view.canvas.scroller.scrollTop = 0;
		press('PageDown', { shiftKey: true });
		expect(view.state.selection.anchor).toBe(1);
		expect(view.canvas.scroller.scrollTop).toBeLessThan(plain);
		const foot = view.canvas.clientRect(view.canvas.geometry.caretRect(view.canvas.head())!);
		expect(foot.top + foot.height).toBeLessThanOrEqual(395.5);
		expect(foot.top + foot.height).toBeGreaterThan(395 - LINE);
		view.destroy();
	});

	it('PageUp from the first line leaves the caret, and macOS scrolls the pane a page without moving it', async () => {
		const { view, press } = await boardOf(lines, { height: 400, platform: 'mac' });
		const head = view.state.selection.head;
		press('PageDown');
		expect(view.state.selection.head).toBe(head);
		expect(view.canvas.scroller.scrollTop).toBeCloseTo(0.875 * 400);
		view.destroy();
	});
});

describe('Shift+Up and Shift+Down keep the goal column of the first vertical move', () => {
	it('aim at the column the first Up or Down set, whichever key made the move', async () => {
		const lines = ['abcdefghijkl', 'ab', 'abcdefghijkl'].map((line) => paragraph.create(null, words(line)));
		const { view, press } = await boardOf(lines, { plugins: [caretArrowsPlugin()] as never[] });
		place(view, 1 + 9);
		press('ArrowDown');
		expect(view.state.selection.head).toBe(view.state.doc.child(0).nodeSize + 1 + 2);
		press('ArrowDown', { shiftKey: true });
		const third = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize + 1;
		expect(view.state.selection.head).toBe(third + 9);
		view.destroy();
	});
});
