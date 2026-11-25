// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasView, StyleLook } from '$lib/editor/canvas';
import { composeNodeViews, goalColumnOf } from '$lib/editor/canvas';
import { VERTICAL_GOAL_META } from '$lib/editor/canvas/interaction/motion/extendSelection';
import { mathNodeViews } from '$lib/editor/canvas/math/mathViews';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';
import { schema as latex } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { settleTestView, testSchema } from '../../testing/testCanvasView';
import { createLaidOutTestView } from '../../testing/laidOutTestView';
import { tableRules } from '../../testing/tableTestRules';

const { paragraph, cite } = testSchema.nodes;
const text = (value: string) => testSchema.text(value);
const twenty = '0123456789 012345678';

async function viewOf(children: ReturnType<typeof paragraph.create>[], rules: Parameters<typeof createLaidOutTestView>[1] = {}) {
	const doc = testSchema.node('doc', null, children);
	const view = createLaidOutTestView(EditorState.create({ doc, selection: TextSelection.create(doc, 1) }), rules);
	await settleTestView(view);
	return {
		view,
		router: new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux')
	};
}

function press(view: CanvasView, router: KeyRouter, key: string, init: KeyboardEventInit = {}): void {
	const event = new KeyboardEvent('keydown', { key, keyCode: { ArrowUp: 38, ArrowDown: 40 }[key] ?? 0, ...init });
	router.keydown(event);
}

function caretX(view: CanvasView): number {
	return view.canvas.geometry.caretRect(view.canvas.head())!.x;
}

function at(view: CanvasView, pos: number): void {
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
	goalColumnOf(view).reset();
}

describe('Up and Down keep the goal column', () => {
	it('through a shorter line and on to a longer one', async () => {
		const { view, router } = await viewOf([
			paragraph.create(null, text(twenty)),
			paragraph.create(null, text('ab')),
			paragraph.create(null, text(twenty))
		]);
		const third = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
		at(view, 1 + 15);
		const goal = caretX(view);
		press(view, router, 'ArrowDown');
		expect(view.state.selection.head).toBe(view.state.doc.child(0).nodeSize + 1 + 2);
		press(view, router, 'ArrowDown');
		expect(view.state.selection.head).toBe(third + 1 + 15);
		expect(caretX(view)).toBeCloseTo(goal);
		press(view, router, 'ArrowUp');
		press(view, router, 'ArrowUp');
		expect(view.state.selection.head).toBe(1 + 15);
		view.destroy();
	});

	it('forgets the column once the caret moves another way', async () => {
		const { view, router } = await viewOf([
			paragraph.create(null, text(twenty)),
			paragraph.create(null, text('ab')),
			paragraph.create(null, text(twenty))
		]);
		at(view, 1 + 15);
		press(view, router, 'ArrowDown');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.head - 1)));
		press(view, router, 'ArrowDown');
		const third = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
		expect(view.state.selection.head).toBe(third + 1 + 1);
		view.destroy();
	});

	it('steps past an inline atom on the line it enters, never inside it', async () => {
		const { view, router } = await viewOf([
			paragraph.create(null, text(twenty)),
			paragraph.create(null, [text('abc'), cite.create({ key: 'x' }), text('def')])
		]);
		at(view, 1 + 4);
		press(view, router, 'ArrowDown');
		const second = view.state.doc.child(0).nodeSize;
		const { head } = view.state.selection;
		expect(head === second + 1 + 3 || head === second + 1 + 4).toBe(true);
		view.destroy();
	});
});

/** a view over a real language schema, laid out on the fixed measurer */
async function openReal(doc: PMNode, options: Parameters<typeof createLaidOutTestView>[1]) {
	const view = createLaidOutTestView(EditorState.create({ doc, selection: TextSelection.atStart(doc) }), { width: 400, ...options });
	await settleTestView(view);
	const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux');
	return { view, router };
}

const positionOf = (doc: PMNode, needle: string, offset = 0): number => {
	let found = -1;
	doc.descendants((node, pos) => {
		if (found < 0 && node.isText && node.text!.includes(needle)) found = pos + node.text!.indexOf(needle) + offset;
		return found < 0;
	});
	return found;
};

describe('Up and Down through a table', () => {
	const { table, table_row, table_cell, paragraph: tex } = latex.nodes;
	const cell = (value: string) => table_cell.create(null, tex.create(null, latex.text(value)));
	const doc = () =>
		latex.node('doc', null, [
			tex.create(null, latex.text(twenty)),
			table.create(null, [
				table_row.create(null, [cell('0123456789 0123456789 0123456789'), cell('abcdef')]),
				table_row.create(null, [cell('xy'), cell('0123456789')])
			]),
			tex.create(null, latex.text(twenty))
		]);
	const options = {
		rules: tableRules(),
		props: { language: 'latex' as const, nodeViews: composeNodeViews(tableViews('latex')).nodeViews }
	};

	it('keeps the goal column along the wrapped lines of a cell', async () => {
		const { view, router } = await openReal(doc(), options);
		const start = positionOf(view.state.doc, '0123456789 0123456789 0123456789', 4);
		at(view, start);
		const goal = caretX(view);
		press(view, router, 'ArrowDown');
		expect(view.state.selection.$head.parent.textContent).toBe('0123456789 0123456789 0123456789');
		expect(view.state.selection.head).toBeGreaterThan(start + 10);
		expect(caretX(view)).toBeCloseTo(goal);
		press(view, router, 'ArrowUp');
		expect(view.state.selection.head).toBe(start);
		view.destroy();
	});

	it('enters the first cell from the paragraph above and returns to the same column', async () => {
		const { view, router } = await openReal(doc(), options);
		at(view, 1 + 12);
		const goal = caretX(view);
		press(view, router, 'ArrowDown');
		expect(view.state.selection.$head.node(-1).type.name).toBe('table_cell');
		press(view, router, 'ArrowUp');
		expect(view.state.selection.head).toBe(1 + 12);
		expect(caretX(view)).toBeCloseTo(goal);
		view.destroy();
	});
});

describe('Up and Down beside a display formula', () => {
	const { block_math, paragraph: tex } = latex.nodes;
	const doc = () =>
		latex.node('doc', null, [
			tex.create(null, latex.text(twenty)),
			block_math.create(null, latex.text('x^2+y^2')),
			tex.create(null, latex.text(twenty))
		]);
	const options = { props: { language: 'latex' as const, nodeViews: composeNodeViews({ nodeViews: mathNodeViews('latex') }).nodeViews } };

	function goalsSent(view: CanvasView): Transaction[] {
		const sent: Transaction[] = [];
		const dispatch = view.dispatch.bind(view);
		view.dispatch = (tr) => {
			sent.push(tr);
			dispatch(tr);
		};
		return sent;
	}

	it('selects the display from either side and hands the formula the goal x of the key', async () => {
		const { view, router } = await openReal(doc(), options);
		const sent = goalsSent(view);
		const display = view.state.doc.child(0).nodeSize;
		at(view, 1 + 8);
		const goal = caretX(view);
		press(view, router, 'ArrowDown');
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(view.state.selection.from).toBe(display);
		const down = sent.map((tr) => tr.getMeta(VERTICAL_GOAL_META)).find(Boolean);
		expect(down.dir).toBe(1);
		expect(down.x).toBeCloseTo(goal);
		sent.length = 0;
		const below = display + view.state.doc.child(1).nodeSize;
		at(view, below + 1 + 8);
		press(view, router, 'ArrowUp');
		expect(view.state.selection.from).toBe(display);
		expect(sent.map((tr) => tr.getMeta(VERTICAL_GOAL_META)).find(Boolean).dir).toBe(-1);
		view.destroy();
	});
});

describe('Up and Down through a Typst columns block', () => {
	const { typ_env, paragraph: typ } = typSchema.nodes;
	const para = (value: string) => typ.create(null, typSchema.text(value));
	const doc = () =>
		typSchema.node('doc', null, [
			typ_env.create({ name: 'columns', args: '2' }, [para('aaaa bbbb cccc dddd eeee'), para('ffff gggg hhhh iiii jjjj')]),
			para(twenty)
		]);
	const columns: StyleLook = { columnCount: '2', columnGap: '20px', columnFill: 'balance' };

	// the bottom of column one goes on at the top of column two, as the text reads
	it('visits the lines in reading order and comes back the same way', async () => {
		const { view, router } = await openReal(doc(), { width: 200, rules: [{ selector: 'div.typ-environment', look: columns }] });
		at(view, 1 + 2);
		const goal = caretX(view);
		const down = [view.state.selection.head];
		const xs: number[] = [];
		while (view.state.selection.$head.parent.textContent !== twenty && down.length < 12) {
			press(view, router, 'ArrowDown');
			down.push(view.state.selection.head);
			xs.push(caretX(view));
		}
		expect(view.state.selection.$head.parent.textContent).toBe(twenty);
		expect(down).toEqual([...down].sort((a, b) => a - b));
		expect(new Set(down).size).toBe(down.length);
		expect(xs[0], 'the next line of column one at the goal x').toBeCloseTo(goal);
		expect(xs.at(-1), 'the paragraph below at the goal x').toBeCloseTo(goal);
		expect(Math.max(...xs), 'a line in column two').toBeGreaterThan(100);
		for (let step = down.length - 2; step >= 0; step--) {
			press(view, router, 'ArrowUp');
			expect(view.state.selection.head).toBe(down[step]);
		}
		view.destroy();
	});
});
