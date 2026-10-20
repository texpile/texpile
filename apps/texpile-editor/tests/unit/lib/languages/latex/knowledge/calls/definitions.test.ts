import { describe, expect, it } from 'vitest';
import { definitionsIn } from '$lib/languages/latex/knowledge/calls/definitions';

describe('definitions', () => {
	it('reads the signature from the arity, the default, the spec and what the definer makes', () => {
		const found = definitionsIn(
			'\\newcommand\\R{x}\\renewcommand*{\\vec}[2][1]{#1#2}\\NewDocumentCommand{\\pair}{O{0} m}{}\\newtheorem{thm}{Theorem}\\DeclareMathOperator{\\Tr}{Tr}'
		);
		expect(found.map((d) => [d.name, d.kind, d.defines, d.args.map((a) => a.kind).join(' '), d.in ?? ''])).toEqual([
			['R', 'macro', 'new', '', ''],
			['vec', 'macro', 'renew', 'o m', ''],
			['pair', 'macro', 'new', 'o m', ''],
			['thm', 'environment', 'new', 'o', ''],
			['Tr', 'macro', 'new', '', 'math']
		]);
		expect(found[1].body).toBe('#1#2');
	});
});
