import { describe, expect, it } from 'vitest';
import { scanMacroDefinitions } from '../../../../../../src/lib/editor/source/extensions/math-preview/userMacros';

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

	it('reads \\def and \\DeclareRobustCommand definitions, counting \\def parameters', () => {
		const m = scanMacroDefinitions('\\def\\ie{i.e.\\xspace}\n\\def\\pair#1#2{(#1, #2)}\n\\DeclareRobustCommand{\\bert}{BERT}');
		expect(m.ie).toEqual({ def: 'i.e.\\xspace', args: 0 });
		expect(m.pair).toEqual({ def: '(#1, #2)', args: 2 });
		expect(m.bert).toEqual({ def: 'BERT', args: 0 });
	});

	it('keeps the optional first argument default and skips unclosed bodies', () => {
		const m = scanMacroDefinitions('\\newcommand{\\greet}[2][world]{hello #1 #2}\n\\newcommand{\\broken}{\\frac{');
		expect(m.greet).toEqual({ def: 'hello #1 #2', args: 2, optional: 'world' });
		expect(m.broken).toBeUndefined();
	});
});
