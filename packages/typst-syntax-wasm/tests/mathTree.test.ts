import { describe, it, expect } from 'vitest';
import { parseTypstMath, hasTypstError, type TypstMathNode } from '../src/index.js';

const shape = (src: string, node: TypstMathNode): string =>
	node.children.length
		? `${node.kind}(${node.children.map((c) => shape(src, c)).join(' ')})`
		: JSON.stringify(src.slice(node.from, node.to));

describe('parseTypstMath', () => {
	it('gives the Math node with offsets into the source, padding outside it', () => {
		const src = ' frac(a, b)^2 ';
		const math = parseTypstMath(src);
		expect([math.from, math.to]).toEqual([1, 13]);
		expect(shape(src, math)).toBe('Math(MathAttach(MathCall("frac" MathArgs("(" "a" "," " " "b" ")")) "^" "2"))');
	});

	it('flags syntax errors', () => {
		expect(hasTypstError(parseTypstMath('a_'))).toBe(true);
		expect(hasTypstError(parseTypstMath('a_b'))).toBe(false);
		expect(parseTypstMath('  ').children).toEqual([]);
	});
});
