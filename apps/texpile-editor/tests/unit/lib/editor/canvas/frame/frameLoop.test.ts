// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { CanvasPainter, PlacedBlock } from '$lib/editor/canvas';
import { createTestCanvasView, LINE, lineLayout, settleTestView, testStyles, testSchema, testProbe } from '../testing/testCanvasView';

const words = ['fine', 'throws', 'unsized', 'fine too'];

function paperState(): EditorState {
	return EditorState.create({
		doc: testSchema.node(
			'doc',
			null,
			words.map((w) => testSchema.node('paragraph', null, [testSchema.text(w)]))
		)
	});
}

/** what the last frame painted: each block's text, and whether it drew as source */
function recordingPainter(paintBlock?: (block: PlacedBlock) => void): { painter: CanvasPainter; painted: string[] } {
	const painted: string[] = [];
	const painter: CanvasPainter = {
		opaque: true,
		ground: () => void (painted.length = 0),
		paintBlock(_ctx, block) {
			paintBlock?.(block);
			painted.push(`${block.layout.box.node?.node.textContent}${block.layout.error ? ' as source' : ''}`);
		},
		paintCarets() {},
		carets: () => [],
		destroy() {}
	};
	return { painter, painted };
}

afterEach(() => vi.restoreAllMocks());

describe('the frame loop', () => {
	it('draws a block whose layout throws or has no size as its source, logs it once and paints the rest', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { painter, painted } = recordingPainter();
		const view = createTestCanvasView(paperState(), {
			engine: {
				layoutBlock(request) {
					const text = request.node.textContent;
					if (text.endsWith('hrows')) throw new Error('no formatting context for display: ruby');
					return lineLayout(request, text === 'unsized' ? NaN : LINE, null);
				},
				createPainter: () => painter
			}
		});
		await settleTestView(view);
		expect(painted).toEqual(['fine', 'throws as source', 'unsized as source', 'fine too']);
		const second = view.state.doc.child(0).nodeSize;
		expect(testProbe().errors()).toEqual([
			{ pos: second, type: 'paragraph', message: 'no formatting context for display: ruby' },
			{ pos: second + view.state.doc.child(1).nodeSize, type: 'paragraph', message: 'a size that is not a number (NaN)' }
		]);
		view.dispatch(view.state.tr.insertText('!', second + 2));
		await settleTestView(view);
		expect(painted).toEqual(['fine', 't!hrows as source', 'unsized as source', 'fine too']);
		expect(logged).toHaveBeenCalledTimes(2);
		view.destroy();
	});

	// a theme switch: a style the paint reads again can carry another layout, and that frame is the one the writer sees
	it('lays out and paints again in the frame whose paint found a layout changed', async () => {
		const styles = testStyles();
		const events: string[] = [];
		let bump = false;
		const { painter } = recordingPainter((block) => {
			events.push(`paint ${block.layout.box.node?.node.textContent}`);
			if (bump) styles.epoch++;
			bump = false;
		});
		let theme = 'light';
		const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('one')])]);
		const view = createTestCanvasView(EditorState.create({ doc }), {
			engine: {
				createStyles: () => styles,
				createPainter: () => ({ ...painter, paintKey: () => theme }),
				layoutBlock(request) {
					events.push(`layout ${request.node.textContent}`);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		events.length = 0;
		const frames = testProbe().frameStats().frames;
		[bump, theme] = [true, 'dark'];
		view.dispatch(view.state.tr.setMeta('repaint', true));
		await settleTestView(view);
		expect([testProbe().frameStats().frames - frames, events]).toEqual([1, ['paint one', 'layout one', 'paint one']]);
		view.destroy();
	});

	it('draws a block whose paint throws as its source from the next frame', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { painter, painted } = recordingPainter((block) => {
			if (block.layout.box.node?.node.textContent === 'throws' && !block.layout.error) throw new Error('bad gradient');
		});
		const view = createTestCanvasView(paperState(), { engine: { createPainter: () => painter } });
		await settleTestView(view);
		expect(painted).toEqual(['fine', 'throws as source', 'unsized', 'fine too']);
		expect(
			testProbe()
				.errors()
				.map((e) => e.message)
		).toEqual(['bad gradient']);
		view.destroy();
	});
});
