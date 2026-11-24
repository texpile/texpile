// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { CanvasNodeViews, CanvasView } from '$lib/editor/canvas';
import type { Platform } from '$lib/editor/keys/platformKeys';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { settleTestView, testSchema } from '../testing/testCanvasView';
import { createLaidOutTestView } from '../testing/laidOutTestView';

const { paragraph, image, cite } = testSchema.nodes;
const text = (value: string) => testSchema.text(value);
const KEY_CODES: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, b: 66, f: 70, n: 78, p: 80 };

// a formula: a nested editor owns its caret, and its face shows no content of the document's
const formula: CanvasNodeViews = {
	cite: (_node, view) => ({ dom: view.canvas.build.el('span'), setSelection: () => {}, stopEvent: () => false })
};

type Doc = ReturnType<typeof testSchema.node>;

/** paragraph `first` (with any inline nodes), a block image, paragraph `two` */
function docOf(first: string, ...inline: ReturnType<typeof cite.create>[]): Doc {
	return testSchema.node('doc', null, [
		paragraph.create(null, [text(first), ...inline]),
		image.create({ label: 'fig:a' }),
		paragraph.create(null, text('two'))
	]);
}

async function keysOn(doc: Doc, select: (doc: Doc) => Selection, nodeViews?: CanvasNodeViews, platform: Platform = 'linux') {
	const view: CanvasView = createLaidOutTestView(EditorState.create({ doc, selection: select(doc) }), { nodeViews });
	await settleTestView(view);
	const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, platform);
	const press = (key: string, init: KeyboardEventInit = {}) => {
		router.keydown(new KeyboardEvent('keydown', { key, keyCode: KEY_CODES[key] ?? 0, ...init }));
		return view.state.selection;
	};
	return { view, press };
}

const caret = (pos: number) => (doc: Doc) => TextSelection.create(doc, pos);

describe('the caret engine: Left and Right', () => {
	// a direction read from the run under the caret sent Right back and forth at the run's edge
	it("walk through right-to-left text to the paragraph's end, each press at a new place", async () => {
		const doc = testSchema.node('doc', null, [paragraph.create(null, text('ab \u05d0\u05d1\u05d2 cd'))]);
		for (const [key, start, end] of [
			['ArrowRight', 1, doc.content.size - 1],
			['ArrowLeft', doc.content.size - 1, 1]
		] as const) {
			const { view, press } = await keysOn(doc, caret(start));
			const places = new Set<string>();
			let head: number = start;
			for (let presses = 0; presses < 20 && head !== end; presses++) {
				head = press(key).head;
				const place = `${head}:${view.canvas.head().affinity}`;
				expect(places.has(place), `${key} came back to ${place}`).toBe(false);
				places.add(place);
			}
			expect(head).toBe(end);
			view.destroy();
		}
	});

	it('select the block across a textblock edge, and go on into the text past it', async () => {
		const { view, press } = await keysOn(docOf('ab'), caret(3));
		expect(press('ArrowRight')).toBeInstanceOf(NodeSelection);
		expect(press('ArrowRight')).toMatchObject({ empty: true, head: view.state.doc.child(0).nodeSize + 2 });
		expect(press('ArrowLeft')).toBeInstanceOf(NodeSelection);
		expect(press('ArrowLeft')).toMatchObject({ empty: true, head: 3 });
		view.destroy();
	});

	// LyX passes an inset in one press; a chip selected first took two
	it('step over an inline atom in one press, and extend over it whole with Shift', async () => {
		const { view, press } = await keysOn(docOf('ab', cite.create({ key: 'k' })), caret(3));
		expect(press('ArrowRight')).toMatchObject({ empty: true, head: 4 });
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		expect(press('ArrowRight', { shiftKey: true })).toMatchObject({ anchor: 3, head: 4 });
		view.destroy();
	});

	it('select a formula beside the caret, where its own editor takes the caret, and extend over it whole with Shift', async () => {
		const { view, press } = await keysOn(docOf('ab', cite.create({ key: 'k' })), caret(3), formula);
		expect(press('ArrowRight')).toMatchObject({ from: 3, to: 4 });
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
		expect(press('ArrowRight', { shiftKey: true })).toMatchObject({ anchor: 1, head: 4 });
		view.destroy();
	});

	it('take Ctrl+B and Ctrl+F as Left and Right on macOS', async () => {
		const { view, press } = await keysOn(docOf('ab'), caret(3), undefined, 'mac');
		expect(press('f', { ctrlKey: true })).toBeInstanceOf(NodeSelection);
		expect(press('b', { ctrlKey: true })).toMatchObject({ empty: true, head: 3 });
		view.destroy();
	});

	it('leave a right-to-left line by its right end for the block below', async () => {
		const { view, press } = await keysOn(docOf('אבג'), caret(1));
		// a Hebrew line starts at its right end, and the blocks keep their order: Right goes on down
		expect(press('ArrowRight')).toBeInstanceOf(NodeSelection);
		view.destroy();
	});
});

describe('the caret engine: Up and Down', () => {
	it('select the block below from the last line, and go on to the text beyond it', async () => {
		const { view, press } = await keysOn(docOf('ab'), caret(2));
		expect(press('ArrowDown')).toBeInstanceOf(NodeSelection);
		expect(press('ArrowDown')).toBeInstanceOf(TextSelection);
		expect(view.state.selection.head).toBeGreaterThan(view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize);
		view.destroy();
	});

	it('pass a block with Shift, whose range ends only in text, and take Ctrl+N as Down on macOS', async () => {
		const { view, press } = await keysOn(docOf('ab'), caret(2), undefined, 'mac');
		const two = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
		expect(press('ArrowDown', { shiftKey: true })).toMatchObject({ anchor: 2 });
		expect(view.state.selection.head).toBeGreaterThan(two);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
		expect(press('n', { ctrlKey: true })).toBeInstanceOf(NodeSelection);
		view.destroy();
	});
});

describe('the caret engine from inside a raw chip', () => {
	it('Shift+ArrowDown extends to the paragraph below', async () => {
		const { schema } = await import('$lib/languages/latex/schema/latexPMSchema');
		const { caretArrowsPlugin } = await import('$lib/editor/canvas');
		const { createTestCanvasView } = await import('../testing/testCanvasView');
		const { paragraph: p, inline_latex: chip } = schema.nodes;
		const first = p.create(null, [schema.text('Short '), chip.create(null, schema.text('\\thanks{grant}')), schema.text(' visits.')]);
		const doc = schema.nodes.doc.create(null, [first, p.create(null, schema.text('Next paragraph.'))]);
		const anchor = 1 + 'Short '.length + 1 + 2;
		const plugins = [caretArrowsPlugin()];
		const view = createTestCanvasView(EditorState.create({ doc, selection: TextSelection.create(doc, anchor), plugins }), { plugins });
		await settleTestView(view);
		view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
		expect(view.state.selection).toMatchObject({ anchor, head: first.nodeSize + 1 });
		view.destroy();
	});
});

// Ctrl+Left and Ctrl+Right left a selected \pause or footnote chip selected
it('moves a word key from a selected chip to its edge', async () => {
	const chip = (doc: Doc) => NodeSelection.create(doc, 3);
	const right = await keysOn(docOf('ab', cite.create({ key: 'k' })), chip);
	expect(right.press('ArrowRight', { ctrlKey: true })).toMatchObject({ empty: true, head: 4 });
	right.view.destroy();
	const left = await keysOn(docOf('ab', cite.create({ key: 'k' })), chip);
	expect(left.press('ArrowLeft', { ctrlKey: true })).toMatchObject({ empty: true, head: 3 });
	left.view.destroy();
});
