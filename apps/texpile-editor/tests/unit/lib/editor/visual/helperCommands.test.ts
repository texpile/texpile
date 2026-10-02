import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { setHeadingLevel } from '$lib/editor/visual/helperCommands';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

function run(doc: Node, command: Command): Node {
	let state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
	expect(command(state, (tr) => (state = state.apply(tr)))).toBe(true);
	return state.doc;
}

describe('the heading picker', () => {
	it('keeps a \\chapter a chapter when it is made unnumbered, and makes it a subsection at level 2', () => {
		const text = '\\documentclass{report}\n\\begin{document}\n\\chapter{Introduction}\nSome words.\n\\end{document}\n';
		const parsed = parseLatexFile(text);
		expect(serializeLatexFile(parsed, run(parsed.doc, setHeadingLevel(1, false)))).toContain('\\chapter*{Introduction}');
		expect(serializeLatexFile(parsed, run(parsed.doc, setHeadingLevel(2, true)))).toContain('\\subsection{Introduction}');
	});

	it('keeps a Typst heading its label and its numbering at another level', () => {
		const labelled = parseTypstFile('== Methods <sec:methods>\n\nAs shown in @sec:methods.\n');
		expect(serializeTypstFile(labelled, run(labelled.doc, setHeadingLevel(1)))).toBe(
			'= Methods <sec:methods>\n\nAs shown in @sec:methods.\n'
		);
		const unnumbered = parseTypstFile('#heading(level: 2, numbering: none)[Acknowledgements]\n');
		expect(serializeTypstFile(unnumbered, run(unnumbered.doc, setHeadingLevel(1)))).toContain('numbering: none');
	});
});
