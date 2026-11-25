// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { CanvasNodeViewConstructor } from '$lib/editor/canvas';
import { createTestCanvasView, LINE, lineLayout, settleTestView, testSchema } from '../testing/testCanvasView';

const numberedFigure: CanvasNodeViewConstructor = (_node, view, getPos) => {
	const { el, counters } = view.canvas.build;
	const dom = el('div', 'imagePluginRoot');
	dom.setAttribute('data-figure-number', String(counters.at(getPos()!, 'figure')));
	return { dom };
};

describe('block elements', () => {
	it('rebuild and relay a figure whose number changed when a figure is inserted above it', async () => {
		const doc = testSchema.node('doc', null, [
			testSchema.node('paragraph', null, [testSchema.text('intro')]),
			testSchema.node('image', { label: 'fig:b' })
		]);
		const drawn: string[] = [];
		const view = createTestCanvasView(EditorState.create({ doc }), {
			nodeViews: { image: numberedFigure },
			engine: {
				layoutBlock(request) {
					if (request.node.type.name === 'image')
						drawn.push(`${request.node.attrs.label} ${request.root.getAttribute('data-figure-number')}`);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		view.dispatch(view.state.tr.insert(0, testSchema.node('image', { label: 'fig:a' })));
		await settleTestView(view);
		expect(drawn).toEqual(['fig:b 1', 'fig:a 1', 'fig:b 2']);
		view.destroy();
	});
});
