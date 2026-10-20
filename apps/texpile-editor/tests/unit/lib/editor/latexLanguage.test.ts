// The point of the hand-written LaTeX mode is that a .tex buffer carries the SAME tag vocabulary
// the Typst and Markdown modes emit, so cmHighlight colours one construct one way in all three
// dialects. These pin that mapping: headings, commands-as-functions, math, labels, environments,
// verbatim, and the module commands. (Its predecessor, legacy-modes' stex, filed nearly everything
// under tags.tagName, which the shared style does not colour at all.)
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { toggleComment } from '@codemirror/commands';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { latex } from '$lib/languages/latex/source/latexLanguage';

const DOC = `% a comment
\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\section{Introduction}
Some \\textbf{bold} text with $E = mc^2$ inline.
\\begin{equation}
  \\alpha + \\beta \\label{eq:sum}
\\end{equation}
See \\ref{eq:sum} and \\cite{knuth84}.
\\begin{verbatim}
raw code here
\\end{verbatim}
\\begin{itemize}
  \\item First
\\end{itemize}
Line one \\\\
\\url{https://example.org}
\\end{document}
`;

// Opaque style classes say nothing about WHICH tag was applied; name the tags so the assertions
// read as semantics. The modified tags (function-of-variableName, special-of-string) are the same
// cached instances the tokenTable emits, so identity lookup matches.
const named = tagHighlighter([
	{ tag: tags.comment, class: 'comment' },
	{ tag: tags.heading, class: 'heading' },
	{ tag: tags.keyword, class: 'keyword' },
	{ tag: tags.className, class: 'env' },
	{ tag: tags.labelName, class: 'label' },
	{ tag: tags.function(tags.variableName), class: 'command' },
	{ tag: tags.moduleKeyword, class: 'module' },
	{ tag: tags.special(tags.string), class: 'mathtext' },
	{ tag: tags.special(tags.variableName), class: 'mathcmd' },
	{ tag: tags.controlKeyword, class: 'mathdelim' },
	{ tag: tags.monospace, class: 'mono' },
	{ tag: tags.url, class: 'url' },
	{ tag: tags.contentSeparator, class: 'linebreak' },
	{ tag: tags.processingInstruction, class: 'marker' },
	{ tag: tags.escape, class: 'escape' }
]);

/** every tagged span in `doc`, as {text, cls} */
function tokens(doc: string): { text: string; cls: string }[] {
	const state = EditorState.create({ doc, extensions: [latex()] });
	const tree = ensureSyntaxTree(state, doc.length, 5000);
	const out: { text: string; cls: string }[] = [];
	if (tree) highlightTree(tree, named, (from, to, cls) => out.push({ text: doc.slice(from, to), cls }));
	return out;
}

const clsOf = (toks: { text: string; cls: string }[], needle: string) => toks.find((t) => t.text.includes(needle))?.cls ?? '';

describe('latex language', () => {
	const toks = tokens(DOC);

	it('emits highlight tags, so the document is not painted flat', () => {
		expect(toks.length).toBeGreaterThan(0);
	});

	it('tags the comment', () => {
		expect(clsOf(toks, 'a comment')).toBe('comment');
	});

	it('tags sectioning: the macro as a command, the title as a heading', () => {
		expect(clsOf(toks, '\\section')).toBe('command');
		expect(clsOf(toks, 'Introduction')).toBe('heading');
	});

	it('tags a generic command the way typst tags a function call', () => {
		expect(clsOf(toks, '\\textbf')).toBe('command');
	});

	it('tags preamble module commands', () => {
		expect(clsOf(toks, '\\documentclass')).toBe('module');
		expect(clsOf(toks, '\\usepackage')).toBe('module');
		expect(clsOf(tokens('\\bibliographystyle{plain}\n\\includegraphics{a}\n'), '\\bibliographystyle')).toBe('module');
		expect(clsOf(tokens('\\includegraphics{a}\n'), '\\includegraphics')).toBe('command');
	});

	it('tags math the way the typst mode does: delimiters, content, commands', () => {
		expect(toks.some((t) => t.text === '$' && t.cls === 'mathdelim')).toBe(true);
		expect(clsOf(toks, 'mc')).toBe('mathtext');
		expect(clsOf(toks, '\\alpha')).toBe('mathcmd');
	});

	it('a math ENVIRONMENT is math too, and \\label works inside it', () => {
		expect(clsOf(toks, '\\beta')).toBe('mathcmd');
		expect(clsOf(toks, 'eq:sum')).toBe('label');
	});

	it('tags \\ref and \\cite keys as labels, like typst @refs', () => {
		expect(clsOf(toks, 'knuth84')).toBe('label');
	});

	it('colours only commands whose argument is a key', () => {
		const toks = tokens('\\setcitestyle{authoryear} \\Cref{fig:a} \\footcite[p. 2]{knuth84}');
		expect(clsOf(toks, 'authoryear')).not.toBe('label');
		expect(clsOf(toks, 'fig:a')).toBe('label');
	});

	it('tags \\begin/\\end as keywords and the environment name distinctly', () => {
		expect(clsOf(toks, '\\begin')).toBe('keyword');
		expect(clsOf(toks, 'equation')).toBe('env');
		expect(clsOf(toks, 'itemize')).toBe('env');
	});

	it('verbatim content reads as monospace, like a typst raw block', () => {
		expect(clsOf(toks, 'raw code here')).toBe('mono');
	});

	it('leaves verbatim at its own \\end, so the rest of the file still highlights', () => {
		// the marker tag, not tags.list - the theme colours markers and leaves tags.list alone
		// (md's list rule spans whole subtrees; see cmHighlight)
		expect(clsOf(toks, '\\item')).toBe('marker');
	});

	it('tags \\\\ as a line break and \\url content as a url', () => {
		expect(toks.some((t) => t.cls === 'linebreak')).toBe(true);
		expect(clsOf(toks, 'https://example.org')).toBe('url');
	});

	it('escaped specials read as escapes, not commands', () => {
		expect(clsOf(tokens('100\\% sure\n'), '\\%')).toBe('escape');
	});

	it('display math via \\[ ... \\] round-trips in and out of math mode', () => {
		const t = tokens('\\[ x^2 \\] then \\textit{prose}\n');
		expect(clsOf(t, 'x^2')).toBe('mathtext');
		expect(clsOf(t, '\\textit')).toBe('command');
	});

	it('Mod-/ toggles a % line comment', () => {
		const state = EditorState.create({ doc: 'Some text\n', extensions: [latex()] });
		let next = state;
		toggleComment({ state, dispatch: (tr) => (next = tr.state) });
		expect(next.doc.toString()).toBe('% Some text\n');
	});
});
