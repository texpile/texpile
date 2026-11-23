// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { FaceElement } from '$lib/editor/canvas';
import { createTestCanvasView, LINE, lineLayout, settleTestView, testSchema } from '../testing/testCanvasView';

describe('the view document', () => {
	it('relays a paragraph the line breaking breaks again when the caret leaves it, and nothing else', async () => {
		const doc = testSchema.node('doc', null, [
			testSchema.node('paragraph', null, [testSchema.text('typed in')]),
			testSchema.node('blockquote', null, [testSchema.node('paragraph', null, [testSchema.text('quoted')])])
		]);
		const laid: string[] = [];
		const view = createTestCanvasView(EditorState.create({ doc, selection: TextSelection.create(doc, 3) }), {
			engine: {
				layoutBlock(request) {
					laid.push(request.node.textContent);
					return lineLayout(request, LINE, null);
				},
				createBreaking: () => ({
					update: (before, state) => (before.selection.$head.parent === state.selection.$head.parent ? [] : [before.selection.$head.parent])
				})
			}
		});
		await settleTestView(view);
		laid.length = 0;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.child(0).nodeSize + 3)));
		await settleTestView(view);
		expect(laid).toEqual(['typed in']);
		laid.length = 0;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
		await settleTestView(view);
		expect(laid).toEqual(['quoted']);
		view.destroy();
	});

	it('lets the children of a block idle heights only measured go, and builds them when a frame draws it', async () => {
		const blocks = Array.from({ length: 80 }, (_, i) =>
			testSchema.node('blockquote', null, [testSchema.node('paragraph', null, [testSchema.text(`quote ${i}`)])])
		);
		const roots = new Map<string, { root: FaceElement; children: number }[]>();
		const view = createTestCanvasView(EditorState.create({ doc: testSchema.node('doc', null, blocks) }), {
			engine: {
				layoutBlock(request) {
					const seen = roots.get(request.node.textContent) ?? [];
					roots.set(request.node.textContent, [...seen, { root: request.root, children: request.root.children.length }]);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		for (let wait = 0; wait < 200 && !roots.has('quote 79'); wait++) await new Promise((done) => setTimeout(done, 10));
		const [measured] = roots.get('quote 79')!;
		expect(measured.children).toBe(1);
		expect(measured.root.children).toHaveLength(0);
		view.canvas.scroller.scrollTop = 80 * LINE;
		await settleTestView(view);
		const drawn = roots.get('quote 79')!.at(-1)!;
		expect(drawn.root).toBe(measured.root);
		expect(drawn.children).toBe(1);
		view.destroy();
	});
});
