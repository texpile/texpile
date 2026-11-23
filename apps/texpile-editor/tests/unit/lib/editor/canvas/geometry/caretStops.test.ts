import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { testModel } from './geometryFixture';

const { paragraph, label } = schema.nodes;

describe('caret stops (7.1)', () => {
	it('stop at every grapheme boundary and both sides of a leaf, never inside a cluster or a surrogate pair', () => {
		// e + combining acute, a ZWJ family, a flag, a surrogate pair letter
		const text = 'é \u{1f468}‍\u{1f469}‍\u{1f467} \u{1f1eb}\u{1f1f7} \u{1d49c}';
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, [schema.text(text), label.create(), schema.text('x')])]);
		const { geometry } = testModel(doc);
		const offsets = geometry.stopsOf(0).positions.map((pos) => pos - 1);
		const family = 3;
		const flag = family + 8 + 1;
		const letter = flag + 4 + 1;
		const atom = letter + 2;
		expect(offsets).toEqual([0, 2, 3, family + 8, flag, flag + 4, letter, letter + 2, atom + 1, atom + 2]);
	});

	it('walk an Arabic word right to left: each letter a stop, x falling as the position grows', () => {
		const word = 'مرحبا';
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, schema.text(`go ${word} now`))]);
		const { geometry } = testModel(doc);
		const start = 1 + 'go '.length;
		const stops = geometry.stopsOf(0).positions.filter((pos) => pos >= start && pos <= start + word.length);
		expect(stops).toHaveLength(word.length + 1);
		const xs = stops.slice(1, -1).map((pos) => geometry.caretRect({ pos, affinity: 1 })!.x);
		expect(xs).toEqual([...xs].sort((a, b) => b - a));
		expect(new Set(xs).size).toBe(xs.length);
		expect(geometry.directionAt({ pos: start + 2, affinity: 1 })).toBe('rtl');
		const right = Math.max(...xs) + 9.6;
		const line = geometry.lineOf({ pos: start, affinity: 1 })!;
		const at = (x: number) => geometry.hit({ x, y: line.baseline - 4 })!.caret.pos;
		expect([at(right - 2), at(right - 7)]).toEqual([start, start + 1]);
	});
});
