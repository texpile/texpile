// The remote-edit patcher's core guarantees: a re-parse patches into the live doc as the
// smallest block range (untouched nodes keep identity, so NodeViews/caret survive), and the
// result is fully .eq to the fresh parse, orig stamps included.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/schema/schema';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { computeBlockPatch, syncOrigAttrs } from '$lib/editor/blockPatch';

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
	syncOrigAttrs(tr, newDoc);
	return { doc: tr.steps.length ? state.apply(tr).doc : oldDoc, patch };
}

describe('computeBlockPatch + syncOrigAttrs', () => {
	it('same-length remote edit replaces only the edited block, everything else keeps node identity', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(SRC.replace('some words', 'more words')).doc;
		const { doc, patch } = applyPatch(oldDoc, newDoc);

		expect(patch).not.toBeNull();
		expect(patch!.nodes.length).toBe(1);
		expect(doc.eq(newDoc)).toBe(true); // oracle: patched state == fresh parse, orig included
		// same-length edit: no orig.start shift, so every other block survives by reference
		const changed = [];
		for (let i = 0; i < doc.childCount; i++) if (doc.child(i) !== oldDoc.child(i)) changed.push(i);
		expect(changed.length).toBe(1);
	});

	it('an insert shifts later orig stamps without rebuilding their content', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(
			SRC.replace('Second paragraph stays put.\n', 'Second paragraph stays put.\n\nBrand new paragraph.\n')
		).doc;
		const { doc } = applyPatch(oldDoc, newDoc);

		expect(doc.eq(newDoc)).toBe(true);
		expect(doc.childCount).toBe(oldDoc.childCount + 1);
		// blocks after the insert get restamped attrs (new node objects) but reuse their content
		const last = doc.child(doc.childCount - 1);
		const lastOld = oldDoc.child(oldDoc.childCount - 1);
		expect(last.attrs).toEqual(newDoc.child(newDoc.childCount - 1).attrs);
		expect(last.content).toBe(lastOld.content);
	});

	it('an unchanged re-parse is a no-op patch', () => {
		const oldDoc = parseLatexFile(SRC).doc;
		const newDoc = parseLatexFile(SRC).doc;
		expect(computeBlockPatch(oldDoc, newDoc)).toBeNull();
		const state = EditorState.create({ schema, doc: oldDoc });
		const tr = state.tr;
		syncOrigAttrs(tr, newDoc);
		expect(tr.steps.length).toBe(0);
	});
});
