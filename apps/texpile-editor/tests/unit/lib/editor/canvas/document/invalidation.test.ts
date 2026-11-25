// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { windowInvalidation } from '$lib/editor/canvas/document/invalidation';
import type { CanvasNodeViewConstructor, FaceInputKey } from '$lib/editor/canvas';
import { createTestCanvasView, LINE, lineLayout, settleTestView, testSchema } from '../testing/testCanvasView';

const LABELS: FaceInputKey = { kind: 'store', name: 'labels' };

describe('face inputs', () => {
	it('rebuild the blocks whose faces read the input and relay nothing else', async () => {
		const label = { text: 'Figure 1' };
		const imageView: CanvasNodeViewConstructor = (_node, view) => {
			const { el, read } = view.canvas.build;
			const dom = el('div', 'imagePluginRoot');
			dom.setAttribute(
				'data-label',
				read(LABELS, () => label.text)
			);
			return { dom };
		};
		const doc = testSchema.node('doc', null, [
			testSchema.node('paragraph', null, [testSchema.text('before')]),
			testSchema.node('image', { label: 'fig:a' }),
			testSchema.node('paragraph', null, [testSchema.text('after')])
		]);
		const laid: string[] = [];
		const view = createTestCanvasView(EditorState.create({ doc }), {
			nodeViews: { image: imageView },
			engine: {
				layoutBlock(request) {
					laid.push(request.node.type.name === 'image' ? `image ${request.root.getAttribute('data-label')}` : request.node.textContent);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		const first = view.nodeDOM(view.state.doc.child(0).nodeSize);
		laid.length = 0;
		label.text = 'Figure 2';
		windowInvalidation(window).fire(LABELS);
		windowInvalidation(window).fire({ kind: 'store', name: 'glossary' });
		await settleTestView(view);
		expect(laid).toEqual(['image Figure 2']);
		expect(view.nodeDOM(view.state.doc.child(0).nodeSize)).not.toBe(first);
		view.destroy();
	});
});
