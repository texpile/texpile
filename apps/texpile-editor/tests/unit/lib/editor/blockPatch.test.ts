// The remote-edit patcher's core guarantees: a re-parse patches into the live doc as the
// smallest block range (untouched nodes keep identity, so NodeViews/caret survive), and the
// result is fully .eq to the fresh parse.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { computeBlockPatch, computeBlockPatches, syncParseAttrs } from '$lib/editor/visual/blockPatch';

const SRC = `\\documentclass{article}
\\begin{document}
\\section{One}

First paragraph with some words.

Second paragraph stays put.

\\begin{itemize}
\\item alpha
\\item beta
\\end{itemize}

Last paragraph.
\\end{document}
`;

function applyPatch(oldDoc: PMNode, newDoc: PMNode) {
	const state = EditorState.create({ schema, doc: oldDoc });
	const patch = computeBlockPatch(oldDoc, newDoc);
	const tr = state.tr;
	if (patch) tr.replaceWith(patch.from, patch.to, patch.nodes);
	syncParseAttrs(tr, newDoc);
	return { doc: tr.steps.length ? state.apply(tr).doc : oldDoc, patch };
}

describe('computeBlockPatch + syncParseAttrs', () => {
	it('same-length remote edit replaces only the edited block, everything else keeps node identity', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(SRC.replace('some words', 'more words')).doc;
		const { doc, patch } = applyPatch(oldDoc, newDoc);

		expect(patch).not.toBeNull();
		expect(patch!.nodes.length).toBe(1);
		expect(doc.eq(newDoc)).toBe(true); // oracle: patched state == fresh parse
		// every other block survives by reference
		const changed = [];
		for (let i = 0; i < doc.childCount; i++) if (doc.child(i) !== oldDoc.child(i)) changed.push(i);
		expect(changed.length).toBe(1);
	});

	it('an insert leaves the blocks after it untouched, node and all', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(
			SRC.replace('Second paragraph stays put.\n', 'Second paragraph stays put.\n\nBrand new paragraph.\n')
		).doc;
		const { doc } = applyPatch(oldDoc, newDoc);

		expect(doc.eq(newDoc)).toBe(true);
		expect(doc.childCount).toBe(oldDoc.childCount + 1);
		// where a block came from is no attr of its own, so a shifted block is the same node
		expect(doc.child(doc.childCount - 1)).toBe(oldDoc.child(oldDoc.childCount - 1));
	});

	it('an unchanged re-parse is a no-op patch', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(SRC).doc;
		expect(computeBlockPatch(oldDoc, newDoc)).toBeNull();
		const state = EditorState.create({ schema, doc: oldDoc });
		const tr = state.tr;
		syncParseAttrs(tr, newDoc);
		expect(tr.steps.length).toBe(0);
	});
});

// one range from the first changed block to the last rebuilt every block between them: an agent's write to the
// start and the end of a paper redrew the whole paper
describe('computeBlockPatches', () => {
	function patched(oldDoc: PMNode, newDoc: PMNode): PMNode {
		const tr = EditorState.create({ schema, doc: oldDoc }).tr;
		for (const p of computeBlockPatches(oldDoc, newDoc).reverse()) tr.replaceWith(p.from, p.to, p.nodes);
		syncParseAttrs(tr, newDoc);
		return tr.doc;
	}

	it('keeps the blocks between two changed places as the nodes they were', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const next = SRC.replace('some words', 'more words').replace('Last paragraph.', 'Last paragraph, longer.\n\nAnd one after it.');
		const newDoc = parseLatexFile(next).doc;
		const doc = patched(oldDoc, newDoc);
		expect(doc.eq(newDoc)).toBe(true);
		expect(computeBlockPatches(oldDoc, newDoc).length).toBe(2);
		const rebuilt = [];
		for (let i = 0; i < oldDoc.childCount; i++) if (doc.child(i) !== oldDoc.child(i)) rebuilt.push(i);
		expect(rebuilt).toEqual([1, oldDoc.childCount - 1]);
	});

	it('ends in the fresh parse whatever was added, dropped and changed', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		for (const next of [
			SRC.replace('First paragraph with some words.\n\n', '').replace('\\item beta', '\\item beta\n\\item gamma'),
			SRC.replace('\\section{One}', '\\section{One}\n\nNew first.\n\nNew second.').replace('Last paragraph.\n', ''),
			SRC.replace('Second paragraph stays put.', 'First paragraph with some words.'),
			SRC
		]) {
			const newDoc = parseLatexFile(next).doc;
			expect(patched(oldDoc, newDoc).eq(newDoc), next).toBe(true);
		}
	});
});
