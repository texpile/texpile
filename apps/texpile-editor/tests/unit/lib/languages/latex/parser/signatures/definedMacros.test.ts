import { describe, expect, it } from 'vitest';
import { definedMacrosIn } from '$lib/languages/latex/parser/signatures/definedMacros';

describe('the macros a text defines', () => {
	it('lists the ones whose definer states the arguments, comments left out', () => {
		const text = [
			'\\newlength\\gap \\DeclareCiteCommand{\\mycite}{}{}{}{}',
			'\\newcommand{\\a}[2][x]{#2} \\DeclareMathOperator{\\Tr}{Tr} \\RenewDocumentCommand\\b{s m}{}',
			'\\NewDocumentCommand{\\g}{G{x}m}{} % \\newcommand{\\hidden}{x}'
		].join('\n');
		expect(definedMacrosIn(text).map((d) => [d.name, d.signature, d.defines])).toEqual([
			['gap', '', 'new'],
			['a', 'o m', 'new'],
			['Tr', '', 'new'],
			['b', 's m', 'renew']
		]);
	});
});
