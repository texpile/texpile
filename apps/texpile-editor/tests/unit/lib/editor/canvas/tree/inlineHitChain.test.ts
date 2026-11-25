// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { FaceElement } from '$lib/editor/canvas';
import { inlineHitChain, inlineHitLevels } from '$lib/editor/canvas/tree/inlineHitChain';
import { createTestCanvasView, testSchema as s } from '../testing/testCanvasView';

const comment = {
	from: 1,
	to: 9,
	classes: ['pm-range', 'pm-comment'],
	style: '--range-tint: red',
	attrs: { 'data-comment': 't1' },
	spec: {}
};
const proofread = { from: 2, to: 5, classes: ['proofread-spelling'], style: '', attrs: { 'data-comment': 't2' }, spec: {} };

describe('the inline hit chain', () => {
	it('nests the marks in schema order and the decorations merged inside them, parented to the textblock', () => {
		const marks = [s.mark('link', { href: 'https://example.org' }), s.mark('strong')];
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('bold link', marks)])]);
		const view = createTestCanvasView(EditorState.create({ doc }));
		const paragraph = view.nodeDOM(0) as unknown as FaceElement;
		const children = [...paragraph.childNodes];
		const chain = inlineHitChain({
			textblock: paragraph,
			marks: doc.firstChild!.firstChild!.marks,
			decorations: [comment, proofread],
			content: doc.firstChild!,
			contentStart: 1,
			at: 3
		});
		expect(chain.map((el) => el.tagName)).toEqual(['SPAN', 'STRONG', 'A', 'P']);
		expect(chain[0].className).toBe('pm-range pm-comment proofread-spelling');
		expect(chain[0].getAttribute('data-comment')).toBe('t2');
		expect(chain[0].closest('a')?.getAttribute('href')).toBe('https://example.org');
		expect(chain[0].closest('.pm-comment[data-comment]')).toBe(chain[0]);
		expect(paragraph.childNodes).toEqual(children);
		expect(view.posAtDOM(chain[0], 0)).toBe(2);
		expect(view.posAtDOM(chain[0], 0, 1)).toBe(5);
		expect(view.posAtDOM(chain[1], 0, 1)).toBe(10);
	});

	it('is the textblock alone for plain text', () => {
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('plain')])]);
		const view = createTestCanvasView(EditorState.create({ doc }));
		const paragraph = view.nodeDOM(0) as unknown as FaceElement;
		expect(inlineHitChain({ textblock: paragraph, marks: [], decorations: [], content: doc.firstChild!, contentStart: 1, at: 2 })).toEqual([
			paragraph
		]);
	});

	it('gives each element the range it wrapped in the DOM: a mark its run of siblings, the decorations their piece', () => {
		const strong = s.mark('strong');
		const em = s.mark('em');
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('ab', [strong]), s.text('cd', [strong, em]), s.text('ef')])]);
		const view = createTestCanvasView(EditorState.create({ doc }));
		const paragraph = view.nodeDOM(0) as unknown as FaceElement;
		const word = { ...proofread, from: 2, to: 6 };
		const chain = inlineHitChain({
			textblock: paragraph,
			marks: [strong, em],
			decorations: [word],
			content: doc.firstChild!,
			contentStart: 1,
			at: 4
		});
		expect(chain.map((el) => el.tagName)).toEqual(['SPAN', 'EM', 'STRONG', 'P']);
		const range = (el: FaceElement) => [view.posAtDOM(el, 0), view.posAtDOM(el, 0, 1)];
		expect(range(chain[2])).toEqual([1, 5]);
		expect(range(chain[1])).toEqual([3, 5]);
		expect(range(chain[0])).toEqual([3, 5]);
	});

	it('gives the decoration span the look the decorations paint with, for the border the spell box hangs under', () => {
		const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('misspeled')])]);
		const view = createTestCanvasView(EditorState.create({ doc }));
		const paragraph = view.nodeDOM(0) as unknown as FaceElement;
		const look = { borderBottom: '2px dotted red' };
		const word = { ...proofread, from: 1, to: 10, spec: { canvasLook: { look } } };
		const chain = inlineHitChain({
			textblock: paragraph,
			marks: [],
			decorations: [word],
			content: doc.firstChild!,
			contentStart: 1,
			at: 3
		});
		expect(inlineHitLevels(chain[0])?.chain.levels.at(-1)?.look).toEqual(look);
	});
});
