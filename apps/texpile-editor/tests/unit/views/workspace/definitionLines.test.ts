import { describe, expect, it } from 'vitest';
import { definitionLine, labelLine } from '../../../../src/views/workspace/definitionLines';

describe('definitionLine', () => {
	it('finds every definer in the data, a primitive, and skips a commented one', () => {
		const source =
			'% \\newcommand{\\a}{x}\n\\DeclareMathOperator{\\a}{a}\n\\def\\b{y}\n\\NewDocumentCommand\\c{m}{z}\n\\newcommand{\\ab}{w}';
		expect(definitionLine(source, 'a')).toBe(2);
		expect(definitionLine(source, 'b')).toBe(3);
		expect(definitionLine(source, 'c')).toBe(4);
		expect(definitionLine(source, 'd')).toBeNull();
	});
});

describe('labelLine', () => {
	it('finds the line of the definition, not of a reference', () => {
		expect(labelLine('\\ref{x}\n\\label {x}', 'x')).toBe(2);
		expect(labelLine('\\ref{x}', 'x')).toBeNull();
	});
});
