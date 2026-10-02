// @vitest-environment jsdom
// HTML pasted from another app: only its writing comes in. A spreadsheet's cell fills and a page's
// colors are how that app drew the text; Word's and Google Docs' lists become real nested lists.
import { describe, expect, it } from 'vitest';
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { sliceToMarkdown } from '$lib/languages/markdown/visual/clipboard';
import { sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { cleanPastedHtml } from '$lib/editor/paste/pastedHtmlCleanup';

function pastedSlice(html: string) {
	const dom = document.createElement('div');
	dom.innerHTML = cleanPastedHtml(html);
	return PMDOMParser.fromSchema(schema).parseSlice(dom);
}

function pastedAsLatex(html: string): string {
	return sliceToLatex(pastedSlice(html));
}

describe('pasted HTML', () => {
	it('drops cell fills and text colors from another app, and keeps the editor’s own', () => {
		const sheets =
			'<google-sheets-html-origin><table><tr><td style="background-color:rgb(217, 234, 211)">+20 Vitality</td>' +
			'<td style="font-weight:bold;color:#ff0000">Tier</td></tr></table>';
		const latex = pastedAsLatex(sheets);
		expect(latex).not.toMatch(/sethlcolor|\\hl\{|textcolor/);
		expect(latex).toContain('+20 Vitality &\\textbf{Tier}');
		// nor drawn on screen, where the file could not follow
		const shown = document.createElement('div');
		shown.append(DOMSerializer.fromSchema(schema).serializeFragment(pastedSlice(sheets).content));
		expect(shown.innerHTML).not.toMatch(/color/);
		expect(pastedAsLatex('<p><span data-textcolor="1,0,0" data-color-model="rgb">red</span></p>')).toBe('\\textcolor[rgb]{1,0,0}{red}');
	});

	it('turns Word’s list paragraphs and Google Docs’ stray nested lists into nested lists', () => {
		const word =
			"<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·<span>&nbsp;</span></span>One</p>" +
			"<p style='mso-list:l0 level2 lfo1'><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span>Nested</p>" +
			"<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·</span>Two</p><p><o:p>&nbsp;</o:p></p>";
		expect(pastedAsLatex(word)).toBe(
			'\\begin{itemize}\n\\item One\n\\begin{enumerate}\n\\item Nested\n\\end{enumerate}\n\\item Two\n\\end{itemize}'
		);
		// Google Docs' spacer line between paragraphs is no \\ with no line to end
		expect(pastedAsLatex('<b style="font-weight:normal;" id="docs-internal-guid-1"><p>One</p><br><p>Two</p><p><br></p></b>')).toBe(
			'One\n\nTwo'
		);
		const docs = '<ul><li><p>a</p></li><ul><li><p>b</p></li></ul></ul>';
		expect(pastedAsLatex(docs)).toBe('\\begin{itemize}\n\\item a\n\\begin{itemize}\n\\item b\n\\end{itemize}\n\\end{itemize}');
	});

	it('writes a pasted link’s % and # escaped, so a heading’s argument keeps them', () => {
		expect(pastedAsLatex('<h2>See <a href="https://x.com/a%20b#x">the docs</a></h2>')).toBe(
			'\\subsection{See \\href{https://x.com/a\\%20b\\#x}{the docs}}'
		);
	});

	it('keeps Word’s outline numbering numbered, and the number a list copied from its middle starts at', () => {
		const item = (level: number, marker: string, text: string) =>
			`<p style='mso-list:l0 level${level} lfo1'><span style='mso-list:Ignore'>${marker}<span>&nbsp;</span></span>${text}</p>`;
		expect(pastedAsLatex(item(1, '1.', 'One') + item(2, '1.1.', 'Sub') + item(1, '2.', 'Two'))).toBe(
			'\\begin{enumerate}\n\\item One\n\\begin{enumerate}\n\\item Sub\n\\end{enumerate}\n\\item Two\n\\end{enumerate}'
		);
		const dom = document.createElement('div');
		dom.innerHTML = cleanPastedHtml(item(1, '3.', 'Three') + item(1, '4.', 'Four'));
		expect(sliceToMarkdown(PMDOMParser.fromSchema(mdSchema).parseSlice(dom))).toBe('3. Three\n4. Four');
	});

	it('reads underline and monospace runs as marks, and a code editor’s lines as a code block', () => {
		const docs = '<p><span style="text-decoration:underline">under</span> <span style="font-family:\'Courier New\'">f()</span></p>';
		expect(pastedAsLatex(docs)).toBe('\\underline{under} \\texttt{f()}');
		const vscode =
			'<div style="font-family: Consolas, monospace; white-space: pre;"><div><span style="color:#569cd6">let</span> x</div><div>x</div></div>';
		expect(pastedAsLatex(vscode)).toBe('\\begin{verbatim}\nlet x\nx\n\\end{verbatim}');
	});

	it('reads a code editor’s lines as code whichever monospace font leads the list, its spaces as spaces', () => {
		const linux =
			"<div style=\"font-family: 'Droid Sans Mono', 'monospace', monospace; white-space: pre;\"><div>if x:</div><div>&nbsp;&nbsp;y()</div></div>";
		expect(pastedAsLatex(linux)).toBe('\\begin{verbatim}\nif x:\n  y()\n\\end{verbatim}');
	});
});
