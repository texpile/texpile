// Renaming an anchor has to take its references with it. This logic used to live three times, in
// three different shapes, gated on dialect - so renaming a figure's label in a LaTeX document left
// every \ref to it resolving to ??, while the same rename in Typst worked.
//
// The two reference nodes hold their target differently: typst's in an attr, LaTeX's in text. Only
// the LaTeX path changes node sizes, which is what the position mapping is for.
import { describe, it, expect, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { history, redo, undo } from 'prosemirror-history';
import { schema as texSchema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { labelRenameUndo, repointRefs } from '$lib/editor/visual/repointRefs';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { adoptParse } from '$lib/editor/visual/parseOrigins';
import type { Schema, Node as PMNode } from 'prosemirror-model';

function texDoc(refs: string[]): PMNode {
	const inline = refs.flatMap((n) => [
		texSchema.nodes.ref.create({ refType: 'figure', command: 'ref' }, texSchema.text(n)),
		texSchema.text(' ')
	]);
	return texSchema.node('doc', null, [texSchema.node('paragraph', null, inline)]);
}

function typDoc(targets: string[]): PMNode {
	const s = typSchema as Schema;
	const inline = targets.flatMap((t) => [s.nodes.typ_ref.create({ target: t }), s.text(' ')]);
	return s.node('doc', null, [s.node('paragraph', null, inline)]);
}

function refsOf(doc: PMNode): string[] {
	const out: string[] = [];
	doc.descendants((n) => {
		if (n.type.name === 'ref') out.push(n.textContent);
		else if (n.type.name === 'typ_ref') out.push(String(n.attrs.target));
	});
	return out;
}

/** run the helper the way a caller does: inside a transaction it already started */
function apply(doc: PMNode, from: string, to: string): PMNode {
	const state = EditorState.create({ doc });
	const tr = state.tr;
	repointRefs(tr, doc, from, to);
	return state.apply(tr).doc;
}

describe('repointing LaTeX references', () => {
	it('moves every \\ref that named the old label, and leaves the rest alone', () => {
		expect(refsOf(apply(texDoc(['fig:a', 'fig:a', 'fig:b']), 'fig:a', 'fig:new'))).toEqual(['fig:new', 'fig:new', 'fig:b']);
	});

	// the name lives in the node's TEXT here, so each rewrite resizes the node and shifts the
	// positions of the ones after it. A longer new name is the case that exposes an unmapped write.
	it('keeps its place when the new name is a different length', () => {
		expect(refsOf(apply(texDoc(['x', 'x', 'x']), 'x', 'a-much-longer-name'))).toEqual([
			'a-much-longer-name',
			'a-much-longer-name',
			'a-much-longer-name'
		]);
		expect(refsOf(apply(texDoc(['a-long-one', 'a-long-one']), 'a-long-one', 'q'))).toEqual(['q', 'q']);
	});
});

describe('repointing Typst references', () => {
	it('moves every @ref that named the old label', () => {
		expect(refsOf(apply(typDoc(['fig:a', 'fig:b', 'fig:a']), 'fig:a', 'fig:new'))).toEqual(['fig:new', 'fig:b', 'fig:new']);
	});
});

describe('what it refuses to do', () => {
	it('does nothing without a real rename, so a no-op edit is not an undo step', () => {
		expect(refsOf(apply(texDoc(['fig:a']), 'fig:a', 'fig:a'))).toEqual(['fig:a']);
		expect(refsOf(apply(texDoc(['fig:a']), '', 'fig:new'))).toEqual(['fig:a']);
		expect(refsOf(apply(texDoc(['fig:a']), 'fig:a', ''))).toEqual(['fig:a']);
	});
});

describe('a name already in use', () => {
	// each float panel used to check only its OWN kind, so a figure could take a table's name and
	// both would draw as valid while the references silently resolved to one of them
	it('is seen across every kind of anchor, not just its own', () => {
		const doc = texSchema.node('doc', null, [
			texSchema.node('paragraph', null, [texSchema.nodes.label.create({ name: 'sec:a' })]),
			texSchema.nodes.image.create({ src: 'a.png', label: 'fig:a' })
		]);
		expect(labelTaken(doc, 'sec:a', -1)).toBe(true);
		expect(labelTaken(doc, 'fig:a', -1)).toBe(true);
		expect(labelTaken(doc, 'nobody:here', -1)).toBe(false);
	});

	it('does not count the anchor being renamed as its own duplicate', () => {
		const doc = texSchema.node('doc', null, [texSchema.node('paragraph', null, [texSchema.nodes.label.create({ name: 'sec:a' })])]);
		let at = -1;
		doc.descendants((n, pos) => {
			if (n.type.name === 'label') at = pos;
		});
		expect(labelTaken(doc, 'sec:a', at)).toBe(false);
	});
});

describe('undoing a rename', () => {
	it('tells the workspace, so the uses in other files go back and forth with it', () => {
		const events: unknown[] = [];
		vi.stubGlobal('window', globalThis);
		vi.stubGlobal('dispatchEvent', (e: CustomEvent) => events.push(e.detail));
		const doc = texSchema.node('doc', null, [texSchema.node('paragraph', null, [texSchema.nodes.label.create({ name: 'sec:a' })])]);
		let state = EditorState.create({ doc, plugins: [history(), labelRenameUndo] });
		const tr = state.tr.setNodeMarkup(1, null, { ...state.doc.nodeAt(1)!.attrs, name: 'sec:b' });
		repointRefs(tr, state.doc, 'sec:a', 'sec:b');
		state = state.apply(tr);
		undo(state, (t) => (state = state.apply(t)));
		redo(state, (t) => (state = state.apply(t)));
		vi.unstubAllGlobals();
		expect(events).toEqual([
			{ from: 'sec:b', to: 'sec:a' },
			{ from: 'sec:a', to: 'sec:b' }
		]);
	});
});

describe('a rename, saved', () => {
	async function saved(src: string, from: string, to: string): Promise<string> {
		const parsed = await parseLatexFile(src);
		const state = EditorState.create({ doc: parsed.doc, plugins: [parseCarryPlugin] });
		adoptParse(state.doc, parsed.origins);
		const tr = state.tr;
		state.doc.descendants((n, pos) => {
			if (n.type.name === 'label' && n.attrs.name === from) tr.setNodeMarkup(pos, null, { ...n.attrs, name: to });
		});
		repointRefs(tr, state.doc, from, to);
		return serializeLatexFile(parsed, state.apply(tr).doc);
	}
	const doc = (...body: string[]) => ['\\documentclass{article}', '\\begin{document}', ...body, '\\end{document}', ''].join('\n');

	it('writes each reference as it was, the command kept and only the name new', async () => {
		// the name used to be written over the whole \ref{...}, command and all
		const src = doc('See Figure~\\ref{fig:a} in', 'the text, and \\eqref{fig:a}.', '', '\\ref{fig:a} starts this one.');
		expect(await saved(src, 'fig:a', 'fig:b')).toBe(src.replaceAll('fig:a', 'fig:b'));
	});

	it('keeps the line break after a label chip that starts a paragraph', async () => {
		const src = doc('\\section{Introduction}\\label{sec:a}', 'The first line,', 'and a second.', '', 'Next.');
		expect(await saved(src, 'sec:a', 'sec:b')).toBe(src.replace('sec:a', 'sec:b'));
	});
});
