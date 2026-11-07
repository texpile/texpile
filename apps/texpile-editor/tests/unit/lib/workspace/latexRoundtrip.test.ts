import { describe, it, expect } from 'vitest';
import { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { listKeymap } from 'prosemirror-flat-list';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitBlockWithoutDuplicates } from '../../../../src/lib/editor/visual/helperCommands';
import { enterKeepingListEnvironment } from '../../../../src/lib/languages/latex/visual/listEnterKeepsEnvironment';
import { documentStart, parseLatexFile, serializeLatexFile } from '../../../../src/lib/workspace/latexRoundtrip';

// workspace-level round-trip on real ProseMirror Nodes (no JSON intermediate)

const wrap = (body: string) => `\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('parseLatexFile → Node → serializeLatexFile', () => {
	it('returns a real ProseMirror Node, not JSON', () => {
		const p = parseLatexFile(wrap('\\section{Intro}\nHello.'));
		expect(p.doc).toBeInstanceOf(Node);
		expect(p.doc.type.name).toBe('doc');
	});

	it('preserves the preamble verbatim and regenerates the body', () => {
		const tex = wrap('\\section{Intro}\nHello \\textbf{world}.');
		const p = parseLatexFile(tex);
		const out = serializeLatexFile(p, p.doc);

		// preamble is spliced back untouched
		expect(out.startsWith(p.preamble)).toBe(true);
		expect(out.trimEnd().endsWith(p.postamble.trimEnd())).toBe(true);
		// body was regenerated from the Node
		expect(out).toContain('\\section{Intro}');
		expect(out).toContain('Hello \\textbf{world}.');
	});

	// structural round-trip stability is covered by the serializer's own tests; the body
	// isn't byte-stable at this level, so we don't assert that here

	it('serializeLatexFile is synchronous and returns a string', () => {
		const p = parseLatexFile(wrap('x'));
		const out = serializeLatexFile(p, p.doc);
		expect(typeof out).toBe('string');
	});

	// the block an edit lands in regenerates; every other byte of the file must survive it, including
	// the blank lines the body sat between and a command the deterministic rules would spell otherwise
	it('a word changed in one block leaves every other byte of the file alone', () => {
		const tex =
			'\\documentclass{article}\n\\begin{document}\n\nPara one holds ordinary words.\n\nPara two holds an \\emph{emphasised span} and more words.\n\nPara three ends.\n\n\\end{document}\n';
		const swap = (word: string, into: string) => {
			const p = parseLatexFile(tex);
			const state = EditorState.create({ doc: p.doc });
			let at = -1;
			state.doc.descendants((n, pos) => {
				if (at < 0 && n.isText && n.text!.includes(word)) at = pos + n.text!.indexOf(word);
				return at < 0;
			});
			return serializeLatexFile(p, state.apply(state.tr.insertText(into, at, at + word.length)).doc);
		};
		expect(swap('ordinary', 'unusual')).toBe(tex.replace('ordinary', 'unusual'));
		expect(swap('more', 'other')).toBe(tex.replace('more', 'other'));
		expect(swap('ends', 'stops')).toBe(tex.replace('ends', 'stops'));
	});
});

describe('documentStart: verbatim commands', () => {
	it('finds \\begin{document} after a macro defined as a bare \\lstinline', () => {
		const pre = '\\documentclass{article}\n\\newcommand{\\code}{\\lstinline[basicstyle=\\ttfamily]}\n';
		expect(documentStart(`${pre}\\begin{document}\nHi \\code|x|\n\\end{document}\n`)).toBe(pre.length);
	});

	it('still skips a \\begin{document} spelled out inside \\lstinline{...} and \\verb{', () => {
		expect(documentStart('\\lstinline{\\begin{document}} \\verb{\\begin{document}{ x')).toBe(-1);
	});

	it('stops a brace group at the end of the line, so an unclosed \\lstinline{ hides nothing below', () => {
		const pre = 'a \\lstinline{ x\n';
		expect(documentStart(`${pre}\\begin{document}\n}\n`)).toBe(pre.length);
	});
});

const fixtureDir = join(import.meta.dirname, '../../../integration/fixture');
const TIKZCD = '\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}';
const docOf = (body: string, extra = '', cls = 'article') =>
	`\\documentclass{${cls}}\n${extra}\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const afterEnter = (tex: string, anchor: string, typed: string) => {
	const p = parseLatexFile(tex);
	let at = -1;
	p.doc.descendants((n, pos) => {
		if (at < 0 && n.isText && n.text!.includes(anchor)) at = pos + n.text!.indexOf(anchor) + anchor.length;
		return at < 0;
	});
	let state = EditorState.create({ doc: p.doc, selection: TextSelection.create(p.doc, at) });
	const enter = chainCommands(enterKeepingListEnvironment, listKeymap.Enter, splitBlockWithoutDuplicates, baseKeymap.Enter);
	enter(state, (tr) => (state = state.apply(tr)));
	state = state.apply(state.tr.insertText(typed));
	return serializeLatexFile(p, state.doc);
};

describe('a file opened and saved with no edit', () => {
	it('comes back byte for byte', () => {
		const files = [
			...['main.tex', 'plain.tex', 'talk.tex', 'chapters/results.tex'].map((f) => readFileSync(join(fixtureDir, f), 'utf8')),
			docOf(
				`Hello world.\n\n\\[\n${TIKZCD}\n\\]\n\n\\[ x^2 \\]\n\n\\begin{equation}\n${TIKZCD}\n\\end{equation}`,
				'\\usepackage{tikz-cd}\n'
			)
		];
		for (const tex of files) {
			const p = parseLatexFile(tex);
			expect(serializeLatexFile(p, p.doc)).toBe(tex);
		}
	});
});

describe('Enter at the end of a block', () => {
	it('writes only the new paragraph or item', () => {
		const list =
			'\\begin{itemize}\n\\item Apple\n\\begin{itemize}\n\\item Nested one\n\\item Nested two\n\\end{itemize}\n\\item Banana\n\\end{itemize}';
		const cases: [string, string, string, string, string][] = [
			[docOf('Hello world.'), 'Hello world.', 'Second paragraph here.', 'world.\n', 'world.\n\nSecond paragraph here.\n'],
			[docOf(list), 'Banana', 'Cherry', 'Banana\n', 'Banana\n\\item Cherry\n'],
			[
				docOf('\\begin{frame}{First}\nSome words.\n\\end{frame}', '', 'beamer'),
				'Some words.',
				'More words.',
				'words.\n',
				'words.\n\nMore words.\n'
			]
		];
		for (const [tex, anchor, typed, from, to] of cases) expect(afterEnter(tex, anchor, typed)).toBe(tex.replace(from, to));
	});
});
