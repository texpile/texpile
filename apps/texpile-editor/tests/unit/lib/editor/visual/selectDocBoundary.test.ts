// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { holdAtDocEnd, holdAtDocStart } from '$lib/editor/visual/selectDocBoundary';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const { doc } = parseLatexFile('\\documentclass{article}\n\\title{T}\n\\begin{document}\n\\maketitle\n\nText.\n\\end{document}\n');

describe('an arrow on past a gap cursor at the start of the document', () => {
	it('is held, where the browser moved the selection out of the editor', () => {
		const atStart = EditorState.create({ doc, selection: new GapCursor(doc.resolve(0)) });
		expect(holdAtDocStart(atStart)).toBe(true);
		expect(holdAtDocEnd(atStart)).toBe(false);
	});

	it('leaves every other caret to the arrow keys', () => {
		expect(holdAtDocStart(EditorState.create({ doc, selection: TextSelection.atEnd(doc) }))).toBe(false);
	});
});
