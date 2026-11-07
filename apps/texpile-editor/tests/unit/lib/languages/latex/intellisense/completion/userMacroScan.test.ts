import { expect, it } from 'vitest';
import { extractUserDefinitions } from '$lib/languages/latex/intellisense/completion/userMacroScan';

it('reads the commands and environments a buffer defines, and skips a definition inside a comment', () => {
	const { macros, environments } = extractUserDefinitions(
		[
			'\\DeclareMathOperator{\\opone}{one}',
			'\\def\\deftwo#1{[#1]}',
			'\\newenvironment{freshbox}{\\begin{quote}}{\\end{quote}}',
			'% \\newcommand{\\commented}{x}'
		].join('\n')
	);
	expect(macros.map((m) => m.name)).toEqual(expect.arrayContaining(['opone', 'deftwo']));
	expect(macros.map((m) => m.name)).not.toContain('commented');
	expect(environments.map((e) => e.name)).toEqual(['freshbox']);
});
