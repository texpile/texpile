// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { textBeside } from '$lib/editor/visual/gapArrows';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		text: { group: 'inline' },
		paragraph: { content: 'inline*', group: 'block' },
		title: { content: 'inline*', isolating: true },
		frame: { content: 'title? block+', group: 'block' },
		math: { content: 'text*', group: 'block', atom: true },
		cell: { content: 'paragraph+' },
		table: { content: 'cell+', group: 'block', createGapCursor: true }
	}
});
const { paragraph, title, frame, math, cell, table } = schema.nodes;
const words = (text: string) => schema.text(text);

describe('text beside a gap', () => {
	it('is found between a frame title and the paragraph after it', () => {
		const doc = schema.node('doc', null, [frame.create(null, [title.create(null, words('T')), paragraph.create(null, words('Body'))])]);
		const gap = doc.resolve(1 + 3);
		expect(textBeside(gap, 1)).toBe(true);
		expect(textBeside(gap, -1)).toBe(true);
	});

	it('is absent between two display formulas and past the last block', () => {
		const doc = schema.node('doc', null, [math.create(null, words('a')), math.create(null, words('b'))]);
		const between = doc.resolve(3);
		expect(textBeside(between, 1)).toBe(false);
		expect(textBeside(between, -1)).toBe(false);
		expect(textBeside(doc.resolve(doc.content.size), 1)).toBe(false);
	});

	it('is absent between two tables, whose cells hold text, so the gap between them stays', () => {
		const grid = () => table.create(null, cell.create(null, paragraph.create(null, words('x'))));
		const doc = schema.node('doc', null, [grid(), grid()]);
		const between = doc.resolve(doc.firstChild!.nodeSize);
		expect(textBeside(between, 1)).toBe(false);
		expect(textBeside(between, -1)).toBe(false);
	});
});
