import { describe, expect, it } from 'vitest';
import { parser } from '$lib/languages/latex/syntax/parser';
import { modeFromTree } from '$lib/languages/latex/syntax/treeMode';

function namesIn(text: string): string[] {
	const names: string[] = [];
	parser.parse(text).iterate({ enter: (n) => void (n.name === 'ControlWord' && names.push(text.slice(n.from, n.to))) });
	return names;
}

function errorsIn(text: string): number {
	let errors = 0;
	parser.parse(text).iterate({ enter: (n) => void (n.type.isError && errors++) });
	return errors;
}

const modeAtBar = (marked: string) => {
	const pos = marked.indexOf('|');
	const text = marked.slice(0, pos) + marked.slice(pos + 1);
	return modeFromTree(parser.parse(text), text, pos);
};

describe('structureTokens', () => {
	it('closes an environment a definition opens at the definition closing brace', () => {
		const text = '\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\nSome |text';
		expect(errorsIn(text.replace('|', ''))).toBe(0);
		expect(modeAtBar(text)).toBe('text');
	});

	it('keeps a verbatim begin in a definition body inside the definition', () => {
		for (const definition of [
			'\\newcommand{\\bv}{\\begin{verbatim}}',
			'\\def\\bv{\\begin{verbatim} }',
			'\\newenvironment{v}{\\begin{lstlisting}}{\\end{lstlisting}}'
		]) {
			const text = `${definition}\n\\emph{x}\n\\begin{verbatim}\n\\raw\n\\end{verbatim}\n`;
			expect(namesIn(text), definition).toEqual(expect.arrayContaining(['\\emph']));
			expect(namesIn(text), definition).not.toContain('\\raw');
			expect(errorsIn(text), definition).toBe(0);
		}
	});

	it('pairs an end only with the environment of that name', () => {
		expect(modeAtBar('\\begin{equation} x \\end{itemize} y| \\end{equation}')).toBe('math');
		expect(errorsIn('a \\end{proof} } b')).toBe(0);
	});

	it('closes math at a blank line and at the end of the environment around it', () => {
		expect(modeAtBar('$a\n\nb| c')).toBe('text');
		expect(modeAtBar('\\begin{center} $$x \\end{center} y|')).toBe('text');
	});

	it('reads @ as a letter only after \\makeatletter, inside its group', () => {
		expect(namesIn('\\xymatrix{a \\ar@{->}[r] & b}')).toEqual(['\\xymatrix', '\\ar']);
		expect(namesIn('{\\makeatletter \\a@b} \\a@b')).toEqual(['\\makeatletter', '\\a@b', '\\a']);
	});

	it('skips the text of \\iffalse through the \\fi that closes it, and not where it is only named', () => {
		const skipped = (text: string) => {
			const found: string[] = [];
			parser.parse(text).iterate({ enter: (n) => void (n.name === 'Skipped' && found.push(text.slice(n.from, n.to))) });
			return found;
		};
		expect(skipped('a \\iffalse x \\ifx y \\fi % \\fi\nz \\fi b')).toEqual(['\\iffalse x \\ifx y \\fi % \\fi\nz \\fi']);
		expect(skipped('\\let\\ifdraft\\iffalse \\ifdraft d \\fi')).toEqual([]);
		// \ifthenelse takes no \fi; a file's own \ifdraft does, though the ifdraft package has the name
		expect(skipped('\\iffalse \\ifthenelse{a}{b}{c} \\ifdraft d \\fi old \\fi real')).toEqual([
			'\\iffalse \\ifthenelse{a}{b}{c} \\ifdraft d \\fi old \\fi'
		]);
		expect(skipped('\\iffalse \\ifdraft d \\fi old \\fi real')).toEqual(['\\iffalse \\ifdraft d \\fi old \\fi']);
	});

	it("reads url's \\path argument as a url, its % a character", () => {
		const names: string[] = [];
		parser.parse('See \\path{a%b} here.').iterate({ enter: (n) => void names.push(n.name) });
		expect(names).toContain('UrlArgument');
		expect(names).not.toContain('Comment');
	});
});
