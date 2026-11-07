import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { positionOf } from '$lib/editor/visual/extensions/blockHandle/nodePosition';

const para = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));

describe('the block the handle menu was opened on', () => {
	it('is found where an edit above it moved it, and lost once it is rewritten', () => {
		const doc = schema.nodes.doc.create(null, [para('one'), para('two'), para('three')]);
		const two = doc.child(1);
		const moved = new Transform(doc).insert(0, para('zero')).doc;
		expect(positionOf(moved, two)).toBe(2 + 'zero'.length + 'one'.length + 2);
		const rewritten = new Transform(moved).insert(positionOf(moved, two)! + 1, schema.text('!'));
		expect(positionOf(rewritten.doc, two)).toBeNull();
	});
});
