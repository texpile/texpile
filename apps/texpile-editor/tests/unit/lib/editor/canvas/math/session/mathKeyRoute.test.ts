// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { HeadlessMathfield } from 'mathlive';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { leaveKey, suggestionsShowing } from '$lib/editor/canvas/math/session/mathKeyRoute';
import { MathExit } from '$lib/editor/canvas/math/session/mathExit';
import type { CanvasMathSession } from '$lib/editor/canvas/math/session/mathSession';
import { contextMenuOpen, showContextMenu } from '$lib/menus/contextMenu.svelte';

const rect = { top: 0, bottom: 20, left: 0, right: 100 };
// jsdom has none
Element.prototype.scrollIntoView = () => {};
const fields: HeadlessMathfield[] = [];

function fieldOf(value: string): HeadlessMathfield {
	const field = new HeadlessMathfield({
		value,
		syntax: 'latex',
		defaultMode: 'math',
		readOnly: false,
		geometry: {
			atomRect: () => null,
			atomOffsetRect: () => null,
			caretPoint: () => ({ x: 10, y: 10, height: 16 }),
			contentRect: () => rect,
			fieldRect: () => rect,
			hostRect: () => rect,
			scale: 1,
			scrollX: 0,
			scrollBy: () => {}
		},
		pointerCapture: { start: () => {}, stop: () => {} },
		measure: (_font, text) => text.length * 8,
		extents: () => ({ ascent: 8, descent: 2 }),
		family: () => 'serif',
		layoutChanged: () => {}
	});
	field.onFocus();
	fields.push(field);
	return field;
}

/** a session on the formula at pos: the state, its dispatch and the real exit */
function sessionOn(doc: PMNode, pos: number) {
	const node = doc.nodeAt(pos)!;
	const view = {
		state: EditorState.create({ doc, selection: NodeSelection.create(doc, pos) }),
		editable: true,
		dispatched: 0,
		dispatch(tr: Transaction) {
			view.state = view.state.apply(tr);
			view.dispatched++;
		}
	};
	const session = { view, pos, node, field: fieldOf(node.textContent), isEmpty: () => false, markPending: () => {} };
	const full = Object.assign(session, { exit: new MathExit(session as unknown as CanvasMathSession) });
	return full as typeof full & CanvasMathSession;
}

const key = (k: string) => new KeyboardEvent('keydown', { key: k, code: k });

const inlineDoc = schema.nodes.doc.create(null, [
	schema.nodes.paragraph.create(null, [schema.text('a '), schema.nodes.inline_math.create(null, schema.text('x^2')), schema.text(' b')])
]);
const alignDoc = schema.nodes.doc.create(null, [
	schema.nodes.block_math.create({ env: 'align*' }, schema.text('\\begin{align*}a&=b\\end{align*}')),
	schema.nodes.paragraph.create(null, schema.text('after'))
]);

afterEach(() => {
	fields.splice(0).forEach((field) => field.dispose());
	document.getElementById('mathlive-suggestion-popover')?.remove();
});

describe('keys that leave a formula (A6)', () => {
	it('Escape ends the session with the caret after the formula', () => {
		const session = sessionOn(inlineDoc, 3);
		expect(leaveKey(session, key('Escape'))).toBe(true);
		const { selection } = session.view.state;
		expect(selection).toBeInstanceOf(TextSelection);
		expect(selection.head).toBe(3 + session.node.nodeSize);
	});

	it('Escape in LaTeX entry accepts the command selected, as the DOM field did, and the next one leaves', async () => {
		const session = sessionOn(inlineDoc, 3);
		session.field.onKeystroke(new KeyboardEvent('keydown', { key: '\\', code: 'Backslash' }));
		session.field.onInput('a');
		session.field.onInput('l');
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(suggestionsShowing()).toBe(true);
		expect(leaveKey(session, key('Escape'))).toBe(false);
		session.field.onKeystroke(key('Escape'));
		expect(suggestionsShowing()).toBe(false);
		expect(session.field.mode).toBe('math');
		expect(session.field.getValue('latex')).toContain('\\al');
		expect(session.field.selectionIsCollapsed).toBe(false);
		expect(session.view.dispatched).toBe(0);
		expect(leaveKey(session, key('Escape'))).toBe(true);
		expect(session.view.state.selection.head).toBe(3 + session.node.nodeSize);
	});

	it('Escape with the math menu open only closes the menu', () => {
		const session = sessionOn(inlineDoc, 3);
		void showContextMenu([{ label: 'Copy', onclick: () => {} }], { x: 0, y: 0 });
		expect(contextMenuOpen()).toBe(true);
		expect(leaveKey(session, key('Escape'))).toBe(true);
		expect(contextMenuOpen()).toBe(false);
		expect(session.view.dispatched).toBe(0);
	});

	it('Enter leaves an inline formula and adds a row to an align', () => {
		const inline = sessionOn(inlineDoc, 3);
		expect(leaveKey(inline, key('Enter'))).toBe(true);
		expect(inline.view.state.selection.head).toBe(3 + inline.node.nodeSize);

		const align = sessionOn(alignDoc, 0);
		align.field.position = align.field.lastOffset;
		expect(leaveKey(align, key('Enter'))).toBe(false);
		align.field.onKeystroke(key('Enter'));
		expect(align.field.getValue('latex')).toMatch(/\\\\/);
		expect(align.view.dispatched).toBe(0);
	});
});
