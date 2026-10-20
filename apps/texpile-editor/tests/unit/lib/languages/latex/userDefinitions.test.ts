import { describe, expect, it } from 'vitest';
import { definedIn, ownReadingsIn, primitiveDefsIn, signatureOf } from '$lib/languages/latex/userDefinitions';
import { extractUserDefinitions, extractUserMacros } from '$lib/languages/latex/intellisense/completion/userMacroScan';

describe('user definitions', () => {
	it('reads an xparse spec as arguments and keeps names written without a backslash out of the commands', () => {
		const code = '\\NewDocumentCommand{\\pair}{mm}{}\\DeclareDelimFormat{nameyearsep}{, }\\newlength{\\gap}';
		expect(definedIn(code, 'macro').map((d) => [d.name, signatureOf(d.args)])).toEqual([
			['pair', 'm m'],
			['gap', '']
		]);
	});

	it('takes a later definition over an earlier one and \\providecommand keeps the first', () => {
		const text = '\\newcommand{\\a}{x}\\renewcommand{\\a}[1]{#1}\\newcommand{\\b}{x}\\providecommand{\\b}[1]{y}';
		expect(extractUserMacros(text)).toEqual([
			{ name: 'a', signature: 'm' },
			{ name: 'b', signature: '' }
		]);
	});

	it('reads \\def parameters and keeps the body of a definition that carries math delimiters', () => {
		const found = extractUserDefinitions(
			'\\def\\pair#1#2{(#1,#2)}\\newcommand{\\be}{\\begin{equation}}\\newcommand{\\bb}{\\be}\\newenvironment{eq}{\\[}{\\]}'
		);
		expect(found.macros).toEqual([
			{ name: 'pair', signature: 'm m' },
			{ name: 'be', signature: '', body: '\\begin{equation}' },
			{ name: 'bb', signature: '', body: '\\be' }
		]);
		expect(found.environments).toEqual([{ name: 'eq', signature: '', begin: '\\[', end: '\\]' }]);
	});

	it('finds the environments a document defines, \\newtheorem included, and the \\def parameters', () => {
		expect(definedIn('\\newenvironment{box}{}{}\\newtheorem*{thm}{Theorem}', 'environment').map((d) => d.name)).toEqual(['box', 'thm']);
		expect(primitiveDefsIn('\\def\\pair#1#2{x}\\gdef\\odd#1.{x}')).toMatchObject([
			{ name: 'pair', params: 2 },
			{ name: 'odd', params: null, bodyAt: null }
		]);
	});

	it('reads a wrapper defined with \\def as the command it wraps', () => {
		expect(ownReadingsIn('\\def\\figref#1{Figure~\\ref{#1}}').figref?.args).toEqual([{ kind: 'm', role: 'label' }]);
	});
});
