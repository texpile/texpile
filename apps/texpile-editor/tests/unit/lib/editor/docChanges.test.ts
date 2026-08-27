// @vitest-environment jsdom
// Highlighting the wrong words fails silently, so these slice the document with the ranges rather
// than counting them.
import { describe, it, expect } from 'vitest';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { docChanges, changeDecorations } from '$lib/editor/visual/diff/docChanges';
import type { Node as PMNode } from 'prosemirror-model';

const doc = (body: string): PMNode => parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`).doc;

function added(oldBody: string, newBody: string): string[] {
	const newDoc = doc(newBody);
	return changeDecorations(doc(oldBody), newDoc)
		.find()
		.filter((d) => d.spec?.diff === 'inline')
		.map((d) => newDoc.textBetween(d.from, d.to, ' ', ' ').trim())
		.filter(Boolean);
}

function markedNodes(oldBody: string, newBody: string): string[] {
	const newDoc = doc(newBody);
	return changeDecorations(doc(oldBody), newDoc)
		.find()
		.filter((d) => d.spec?.diff === 'node')
		.map((d) => newDoc.nodeAt(d.from)?.type.name ?? '?');
}

/** the node cannot say WHAT changed, so its colour is the whole message */
function nodeTints(oldBody: string, newBody: string): string[] {
	return changeDecorations(doc(oldBody), doc(newBody))
		.find()
		.filter((d) => d.spec?.diff === 'node')
		.map((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class ?? '?');
}

function removed(oldBody: string, newBody: string): string[] {
	return changeDecorations(doc(oldBody), doc(newBody))
		.find()
		.filter((d) => d.from === d.to)
		.map((d) => (d as unknown as { type: { toDOM: HTMLElement | (() => HTMLElement) } }).type.toDOM)
		.map((toDOM) => (typeof toDOM === 'function' ? toDOM() : toDOM))
		.map((el) => el.textContent ?? '')
		.filter(Boolean);
}

function removalsAt(oldBody: string, newBody: string): { after: string; text: string }[] {
	const newDoc = doc(newBody);
	return changeDecorations(doc(oldBody), newDoc)
		.find()
		.filter((d) => d.from === d.to)
		.map((d) => {
			const el = (d as unknown as { type: { toDOM: HTMLElement | (() => HTMLElement) } }).type.toDOM;
			const dom = typeof el === 'function' ? el() : el;
			// block-scoped: a raw character window runs past the paragraph above and proves nothing
			const $pos = newDoc.resolve(d.from);
			return {
				after: newDoc.textBetween($pos.start(), d.from, ' ', ' ').trim(),
				text: dom.textContent ?? ''
			};
		});
}

describe('a deletion, which has nowhere to sit', () => {
	it('marks where the words were, not somewhere near', () => {
		const [only] = removalsAt('Alpha beta gamma delta.', 'Alpha delta.');
		expect(only.text).toContain('beta gamma');
		expect(only.after).toBe('Alpha');
	});

	it('keeps several deletions apart, each on its own paragraph', () => {
		const before = 'First one here.\n\nSecond two here.\n\nThird three here.';
		const after = 'First here.\n\nSecond here.\n\nThird here.';
		const marks = removalsAt(before, after);
		expect(marks).toHaveLength(3);
		expect(marks.map((r) => r.text.trim())).toEqual(['one', 'two', 'three']);
		expect(marks.map((r) => r.after)).toEqual(['First', 'Second', 'Third']);
	});

	it('marks a deletion at the very start of the document in bounds', () => {
		const [only] = removalsAt('Removed. Kept text here.', 'Kept text here.');
		expect(only.text).toContain('Removed');
		expect(only.after).toBe('');
	});

	it('marks a deletion at the very end', () => {
		const marks = removalsAt('Kept text here. Removed.', 'Kept text here.');
		expect(marks.map((r) => r.text).join(' ')).toContain('Removed');
	});

	// the minimal range is "wo.\nT": the T is shared with "Three", so it starts and ends mid-word
	it('names a deleted paragraph in whole words, not the minimal character range', () => {
		const marks = removalsAt('One.\n\nTwo.\n\nThree.', 'One.\n\nThree.');
		expect(marks.map((r) => r.text)).toEqual(['Two.']);
	});

	it('does not claim text that is still on screen went with it', () => {
		const marks = removalsAt('Alpha beta gamma delta.', 'Alpha delta.');
		expect(marks.map((r) => r.text)).toEqual(['beta gamma']);
	});

	it('reports the whole file when the working copy is empty', () => {
		const marks = removalsAt('The entire paper.\n\nEvery paragraph of it.', '');
		expect(marks.length).toBeGreaterThan(0);
		const said = marks.map((r) => r.text).join(' ');
		expect(said).toContain('entire paper');
		expect(said).toContain('Every paragraph');
	});

	function markerEl(oldBody: string, newBody: string): HTMLElement | undefined {
		const [first] = changeDecorations(doc(oldBody), doc(newBody))
			.find()
			.filter((d) => d.from === d.to)
			.map((d) => (d as unknown as { type: { toDOM: HTMLElement | (() => HTMLElement) } }).type.toDOM)
			.map((toDOM) => (typeof toDOM === 'function' ? toDOM() : toDOM));
		return first;
	}

	it('renders the removed text itself rather than hiding it behind a hover', () => {
		const el = markerEl('The very large cat sat.', 'The cat sat.');
		expect(el?.textContent).toContain('very large');
	});

	it('gives a removal between paragraphs a block of its own', () => {
		const el = markerEl('One.\n\nTwo.\n\nThree.', 'One.\n\nThree.');
		expect(el?.tagName).toBe('DIV');
		expect(el?.className).toBe('texpile-diff-removed-block');
	});

	it('keeps a removal inside a paragraph inline, in the line it came from', () => {
		const el = markerEl('The very large cat sat.', 'The cat sat.');
		expect(el?.tagName).toBe('SPAN');
		expect(el?.className).toBe('texpile-diff-removed');
	});

	it('stays out of the document', () => {
		expect(markerEl('One.\n\nTwo.\n\nThree.', 'One.\n\nThree.')?.getAttribute('contenteditable')).toBe('false');
	});

	it('does not call the empty document left by a deleted file an insertion', () => {
		expect(markedNodes('The entire paper.', '')).toEqual([]);
		expect(added('The entire paper.', '')).toEqual([]);
	});

	it('reports a replacement as both a removal and an insertion', () => {
		expect(removed('The quick fox.', 'The slow fox.').join(' ')).toContain('quick');
		expect(added('The quick fox.', 'The slow fox.').join(' ')).toContain('slow');
	});

	it('says nothing when what went had no text in it', () => {
		expect(removed('One.\n\n\\begin{itemize}\n\\item\n\\end{itemize}\n\nTwo.', 'One.\n\nTwo.')).toEqual([]);
	});
});

describe('docChanges', () => {
	it('finds nothing between identical documents', () => {
		expect(docChanges(doc('One paragraph.'), doc('One paragraph.'))).toEqual([]);
	});

	it('marks exactly the inserted words', () => {
		expect(added('The cat sat.', 'The very large cat sat.')).toEqual(['very large']);
	});

	it('carries deleted text on a marker, since it has nowhere to sit', () => {
		expect(removed('The very large cat sat.', 'The cat sat.').join(' ')).toContain('very large');
	});

	it('marks a whole new paragraph', () => {
		const out = added('First.\n\nThird.', 'First.\n\nSecond.\n\nThird.');
		expect(out.join(' ')).toContain('Second.');
	});

	it('marks a new list item where it sits, not the whole list', () => {
		const before = '\\begin{itemize}\n\\item alpha\n\\item gamma\n\\end{itemize}';
		const after = '\\begin{itemize}\n\\item alpha\n\\item beta\n\\item gamma\n\\end{itemize}';
		const out = added(before, after).join(' ');
		expect(out).toContain('beta');
		expect(out).not.toContain('alpha');
	});

	// a raw island IS rendered - the LaTeX is its content - so the change lands on the changed key
	it('marks a change inside a raw island, on the part that changed', () => {
		expect(added('A paragraph.\n\n\\unmodelled{sec:a}', 'A paragraph.\n\n\\unmodelled{sec:b}')).toEqual(['b']);
	});

	// a label keeps its name in an attr, so there is no text range to tint - as with a citation
	it('marks a renamed label as a node', () => {
		expect(markedNodes('A paragraph.\n\n\\label{sec:a}', 'A paragraph.\n\n\\label{sec:b}')).toEqual(['label']);
	});

	it('does not mistake reflowed source for an edit', () => {
		const before = 'The cat sat on the mat.';
		const after = 'The cat sat\non the mat.';
		expect(docChanges(doc(before), doc(after))).toEqual([]);
	});

	// ── content ProseMirror does not draw itself ──────────────────────────────────
	//
	// A CodeMirror island, a MathLive formula and a citation chip all render their own text. An
	// inline decoration inside one has no ProseMirror span to attach to and paints NOTHING, so the
	// range being right is not enough - these have to come back as node marks.

	it('marks the formula, not a range inside it', () => {
		expect(markedNodes('Text with $a+b$ here.', 'Text with $a+c$ here.')).toEqual(['inline_math']);
	});

	it('marks a display formula as a node', () => {
		expect(markedNodes('\\[ a+b \\]', '\\[ a+c \\]')).toEqual(['block_math']);
	});

	it('tints a formula that CHANGED as modified, not as added', () => {
		expect(nodeTints('\\[ a+b \\]', '\\[ a+c \\]')).toEqual(['texpile-diff-changed-node']);
	});

	it('tints a formula that is new as added', () => {
		expect(nodeTints('Some prose.', 'Some prose.\n\n\\[ a+b \\]')).toEqual(['texpile-diff-added-node']);
	});

	it('marks a verbatim block as a node, since CodeMirror owns its text', () => {
		const before = '\\begin{verbatim}\nalpha\n\\end{verbatim}';
		const after = '\\begin{verbatim}\nbeta\n\\end{verbatim}';
		expect(markedNodes(before, after)).toEqual(['code_block']);
	});

	it('marks a citation chip as a node', () => {
		expect(markedNodes('See \\cite{smith2020}.', 'See \\cite{jones2021}.')).toEqual(['citation']);
	});

	// ── changes that live in attributes, which the default token encoder cannot see ──

	it('sees a figure pointed at a different file', () => {
		expect(markedNodes('\\includegraphics{a.png}', '\\includegraphics{b.png}')).toEqual(['image']);
	});

	it('sees a section demoted to a subsection, where only the level changed', () => {
		expect(markedNodes('\\section{One}', '\\subsection{One}')).toEqual(['heading']);
		// the text is identical, so nothing should be marked as inserted text
		expect(added('\\section{One}', '\\subsection{One}')).toEqual([]);
	});

	it('sees a phrase being emphasised, where only the marks changed', () => {
		expect(added('The cat sat.', 'The \\emph{cat} sat.')).toEqual(['cat']);
	});

	// The importer stamps every top-level block with its slice and offset in the source file. Those
	// differ between two versions for blocks nobody touched, so encoding them lights the whole
	// document up - the failure this guards is a diff that reports everything and means nothing.
	it('ignores the importer’s provenance stamps', () => {
		const before = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
		const after = 'First paragraph.\n\nSecond paragraph, edited.\n\nThird paragraph.';
		expect(added(before, after).join(' ')).toContain('edited');
		expect(markedNodes(before, after)).toEqual([]);
	});

	// the blind spot, asserted so it stays a known one; it is why the diff bar has to speak
	it('is blind to a preamble-only change', () => {
		const file = (pre: string) => parseLatexFile(`\\documentclass{article}\n${pre}\\begin{document}\nBody text.\n\\end{document}\n`);
		const before = file('');
		const after = file('\\usepackage{amsmath}\n');
		expect(after.preamble).not.toBe(before.preamble);
		expect(docChanges(before.doc, after.doc)).toEqual([]);
	});
});
