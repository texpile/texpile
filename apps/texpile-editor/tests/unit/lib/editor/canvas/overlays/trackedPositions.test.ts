import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { TrackedPositions } from '$lib/editor/canvas/overlays/trackedPositions';
import { testSchema as s } from '../testing/testCanvasView';

const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('first')]), s.node('paragraph', null, [s.text('second')])]);

describe('tracked positions', () => {
	it('follow a node through an edit before it and die when it is deleted', () => {
		const tracked = new TrackedPositions();
		const second = tracked.track(7, 7 + doc.child(1).nodeSize);
		const typed = new Transform(doc).insert(1, s.text('the '));
		tracked.map(typed.mapping);
		expect([second.from, second.to, second.dead]).toEqual([11, 19, false]);
		tracked.map(new Transform(typed.doc).delete(11, 19).mapping);
		expect(second.dead).toBe(true);
		expect(tracked.size).toBe(0);
	});

	it('keep a range a deletion only shortens and a point an edit beside it leaves', () => {
		const tracked = new TrackedPositions();
		const word = tracked.track(9, 14);
		const point = tracked.track(3);
		tracked.map(new Transform(doc).delete(8, 10).mapping);
		expect([word.from, word.to, word.dead]).toEqual([8, 12, false]);
		expect([point.from, point.dead]).toEqual([3, false]);
		tracked.map(new Transform(doc).delete(2, 5).mapping);
		expect(point.dead).toBe(true);
	});

	it('lose every place when the document is replaced without a mapping', () => {
		const tracked = new TrackedPositions();
		const node = tracked.track(0, 7);
		tracked.map(null);
		expect(node.dead).toBe(true);
	});
});
