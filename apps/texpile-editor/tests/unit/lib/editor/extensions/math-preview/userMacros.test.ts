import { describe, expect, it } from 'vitest';
import { scanMacroDefinitions } from '../../../../../../src/lib/editor/extensions/math-preview/userMacros';

describe('scanMacroDefinitions (math preview macro dictionary)', () => {
	it('captures \\newcommand bodies with nested braces and arg counts', () => {
		const m = scanMacroDefinitions('\\newcommand{\\vect}[1]{\\boldsymbol{#1}}\n\\newcommand{\\R}{\\mathbb{R}}');
		expect(m.vect).toEqual({ def: '\\boldsymbol{#1}', args: 1 });
		expect(m.R).toEqual({ def: '\\mathbb{R}', args: 0 });
	});

	it('maps \\DeclareMathOperator and \\DeclarePairedDelimiter to renderable forms', () => {
		const m = scanMacroDefinitions(
			'\\DeclareMathOperator{\\argmax}{arg\\,max}\n\\DeclareMathOperator*{\\esssup}{ess\\,sup}\n\\DeclarePairedDelimiter\\norm{\\lVert}{\\rVert}'
		);
		expect(m.argmax).toEqual({ def: '\\operatorname{arg\\,max}', args: 0 });
		expect(m.esssup).toEqual({ def: '\\operatorname*{ess\\,sup}', args: 0 });
		expect(m.norm).toEqual({ def: '\\lVert#1\\rVert', args: 1 });
	});

	it('skips the optional-default bracket and unclosed bodies', () => {
		const m = scanMacroDefinitions('\\newcommand{\\greet}[2][world]{hello #1 #2}\n\\newcommand{\\broken}{\\frac{');
		expect(m.greet).toEqual({ def: 'hello #1 #2', args: 2 });
		expect(m.broken).toBeUndefined();
	});
});
