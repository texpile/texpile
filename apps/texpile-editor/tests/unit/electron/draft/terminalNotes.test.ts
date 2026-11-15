import { describe, expect, it } from 'vitest';
import { terminalNotes } from '../../../../../../electron/src/draft/terminalNotes';

describe('terminalNotes', () => {
	it('names the files a line opens and the pages it ships, and leaves measures alone', () => {
		const line =
			'(/usr/share/texlive/texmf-dist/tex/latex/amsmath/amsmath.sty (/usr/share/texlive/texmf-dist/tex/latex/amsmath/amstext.sty)) (./sections/intro.tex [1{/var/lib/texmf/fonts/map/pdftex/updmap/pdftex.map}] [2]';
		expect(terminalNotes(line)).toEqual(['amsmath.sty', 'amstext.sty', 'intro.tex', '[1]', '[2]']);
		expect(terminalNotes('Overfull \\hbox (3.0pt too wide) in paragraph at lines 5--6')).toEqual([]);
	});

	it('leaves out the files the caller does not own, and says a warning as TeX said it', () => {
		const own = (file: string): boolean => !file.includes('_draft/');
		expect(terminalNotes('(./_draft/e3/hooks.tex) (./main.tex', own)).toEqual(['main.tex']);
		const warning = "LaTeX Warning: Reference `fig:one' on page 1 undefined on input line 12.";
		expect(terminalNotes(warning)).toEqual([warning]);
	});
});
