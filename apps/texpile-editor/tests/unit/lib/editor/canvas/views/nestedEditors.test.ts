// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { faceElement, type CanvasNodeViews, type NestedEditor } from '$lib/editor/canvas';
import { createTestCanvasView, testSchema as s } from '../testing/testCanvasView';

describe('nested editors', () => {
	it('follow the selection into the view that takes setSelection, take its keys and end when it leaves', () => {
		const calls: string[] = [];
		const nested = { kind: 'code', keydown: () => 'pass', end: (reason: string) => calls.push(`end ${reason}`) } as unknown as NestedEditor;
		const nodeViews: CanvasNodeViews = {
			heading() {
				const dom = faceElement('pre');
				return {
					dom,
					contentDOM: dom,
					nested,
					setSelection: (anchor, head) => calls.push(`set ${anchor} ${head}`),
					stopEvent: (event) => event.type === 'keydown' && event.target === dom
				};
			}
		};
		const keys: string[] = [];
		const keymap = new Plugin({ props: { handleKeyDown: (_view, event) => !!keys.push(event.key) } });
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('one')]), s.node('heading', null, [s.text('code')])]);
		const view = createTestCanvasView(EditorState.create({ doc, plugins: [keymap] }), { props: { nodeViews } });
		view.focus();
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 9)));
		expect(view.canvas.nested()).toBe(nested);
		view.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
		view.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
		expect(view.canvas.nested()).toBe(null);
		expect(calls).toEqual(['set 1 3', 'end selection']);
		expect(keys).toEqual(['b']);
	});
});

describe('a view with no content that takes setSelection', () => {
	it('starts its editor on a NodeSelection of its node, and a running one follows its node without the focus', () => {
		const calls: string[] = [];
		let running: NestedEditor | null = null;
		const editor = {
			kind: 'math',
			keydown: () => 'pass',
			caretRect: () => null,
			end: (reason: string) => calls.push(`end ${reason}`)
		} as unknown as NestedEditor;
		const nodeViews: CanvasNodeViews = {
			cite() {
				return {
					dom: faceElement('span'),
					get nested() {
						return running;
					},
					setSelection(anchor, head) {
						calls.push(`set ${anchor} ${head}`);
						running = editor;
					},
					stopEvent: () => false
				};
			}
		};
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('one '), s.node('cite', { key: 'k' }), s.text(' two')])]);
		const view = createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews } });
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5)));
		expect(calls).toEqual([]);
		view.focus();
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 5)).setMeta('pointer', true));
		expect(view.canvas.nested()).toBe(editor);
		(view.dom.ownerDocument.activeElement as HTMLElement).blur();
		expect(view.hasFocus()).toBe(false);
		const typed = view.state.tr.insertText('zero ', 1);
		view.dispatch(typed.setSelection(NodeSelection.create(typed.doc, 10)));
		expect(calls).toEqual(['set -1 0', 'set -1 0']);
	});
});
