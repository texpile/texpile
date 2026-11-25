// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { createTestCanvasView, GUTTER, LINE, lineLayout, settleTestView, testSchema } from '../testing/testCanvasView';

describe('coordsAtPos', () => {
	it('lays a block never laid out on demand and answers from its layout, never (0, 0)', async () => {
		const blocks: PMNode[] = [];
		for (let i = 0; i < 200; i++) blocks.push(testSchema.node('paragraph', null, [testSchema.text(`line ${i}`)]));
		const state = EditorState.create({ doc: testSchema.node('doc', null, blocks) });
		const laid: number[] = [];
		const view = createTestCanvasView(state, {
			engine: {
				layoutBlock(request) {
					laid.push(blocks.indexOf(request.node));
					return lineLayout(request, request.node === blocks[150] ? 3 * LINE : LINE, null);
				}
			}
		});
		await settleTestView(view);
		expect(laid).not.toContain(150);
		const pos = view.state.doc.resolve(0).posAtIndex(150) + 3;
		const coords = view.coordsAtPos(pos);
		expect(laid).toContain(150);
		expect(coords).toEqual({ left: GUTTER + 2 * 8, right: GUTTER + 2 * 8, top: 150 * LINE, bottom: 153 * LINE });
		view.destroy();
	});
});
