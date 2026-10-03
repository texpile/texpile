// An edited display follows its environment: a flalign keeps the label on each of its rows
import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { syncBlockMathAttrs } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';

function posOf(doc: Node, type: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === type) at = pos;
	});
	return at;
}

/** the file after the first display's text is changed as the math field writes an edit back */
function editDisplay(source: string, change: (text: string) => string): string {
	const parsed = parseLatexFile(source);
	const state = EditorState.create({ doc: parsed.doc });
	const pos = posOf(state.doc, 'block_math');
	const node = state.doc.nodeAt(pos)!;
	const text = change(node.textContent);
	const edited = node.type.create(syncBlockMathAttrs(node, text), state.schema.text(text));
	return serializeLatexFile(parsed, state.tr.replaceWith(pos, pos + node.nodeSize, edited).doc);
}

describe('an edited flalign', () => {
	it('keeps the label on each of its rows', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{flalign}\na &= b \\label{eq:a} \\\\\nc &= d \\label{eq:c}\n\\end{flalign}\nSee \\eqref{eq:a} and \\eqref{eq:c}.\n\\end{document}\n';
		const out = editDisplay(src, (text) => text.replace('= b', '= b + 1'));
		expect(out).toMatch(/\\begin\{flalign\}\s*a &= b \+ 1 \\label\{eq:a\} \\\\\s*c &= d \\label\{eq:c\}\s*\\end\{flalign\}/);
	});
});

describe('an edited align with rows the file left unlabelled', () => {
	it('writes back only the edit, with no label of its own on those rows', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{align}\na &= b \\label{eq:a} \\\\\nc &= d \\\\\ne &= f\n\\end{align}\n\\end{document}\n';
		expect(editDisplay(src, (text) => text.replace('= f', '= g'))).toBe(src.replace('= f', '= g'));
	});
});
