// \item[label] became a bullet plus bold text and description became itemize
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { EditorState, TextSelection } from 'prosemirror-state';
import { listKeymap } from 'prosemirror-flat-list';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('description lists', () => {
	it('keep the environment and the item labels', () => {
		const out = rt('\\begin{description}\n\\item[Term] definition\n\\item[Other] more\n\\end{description}');
		expect(out).toContain('\\begin{description}');
		expect(out).toContain('\\end{description}');
		expect(out).toContain('\\item[Term]');
		expect(out).toContain('\\item[Other]');
		expect(out).not.toContain('\\textbf{Term}');
		expect(out).toContain('definition');
	});

	it('an empty label stays empty', () => {
		const out = rt('\\begin{itemize}\n\\item[] no bullet\n\\end{itemize}');
		expect(out).toMatch(/\\item\[\]\s*no bullet/);
	});

	it('the editor still shows the label as bold text', () => {
		const doc = LatexParser.latexToProseMirror('\\begin{description}\n\\item[Term] definition\n\\end{description}').doc;
		let bold = '';
		doc.descendants((n) => {
			if (n.isText && n.marks.some((m) => m.type.name === 'strong')) bold += n.text;
		});
		expect(bold).toBe('Term');
	});
});

describe('a description list that loses its first item', () => {
	const FILE = `\\documentclass{article}\n\\begin{document}\nIntro.\n\n\\begin{description}\n\\item[Alpha] First meaning.\n\\item[Beta] Second meaning.\n\\end{description}\n\nOutro.\n\\end{document}\n`;

	it('stays a description list, deleted or lifted out with Backspace', () => {
		const parsed = parseLatexFile(FILE);
		let first = -1;
		parsed.doc.forEach((n, pos) => {
			if (first < 0 && n.type.name === 'list') first = pos;
		});
		const deleted = parsed.doc.copy(
			parsed.doc.content.cut(0, first).append(parsed.doc.content.cut(first + parsed.doc.nodeAt(first)!.nodeSize))
		);
		expect(serializeLatexFile(parsed, deleted)).toContain('\\begin{description}\n\\item[Beta] Second meaning.\n\\end{description}');

		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, first + 2) });
		expect(listKeymap.Backspace(state, (tr) => (state = state.apply(tr)))).toBe(true);
		expect(serializeLatexFile(parsed, state.doc)).toContain('\\begin{description}\n\\item[Beta] Second meaning.\n\\end{description}');
	});
});
