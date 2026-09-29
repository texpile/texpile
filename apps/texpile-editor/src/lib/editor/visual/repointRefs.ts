import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { isHistoryTransaction } from 'prosemirror-history';

// every name renamed from or to, so an undo that swaps two of them is known as a rename
const renamesKey = new PluginKey<ReadonlySet<string>>('labelRenames');

/**
 * Moves every reference from one label name to another, INSIDE the caller's transaction, so the
 * rename and the references it carries are a single undo step.
 *
 * Both dialects on purpose. This logic used to be duplicated per node type and gated on typst, so
 * in a LaTeX document renaming a figure's label left every \ref to it pointing at a name that no
 * longer existed - and after the label chip landed, renaming a SECTION label did the right thing
 * while renaming a figure's did not, in the same document.
 *
 * The two reference nodes hold their target in different places: typst's in an attr, LaTeX's in
 * text. Only the LaTeX path changes node sizes, but positions are mapped either way rather than
 * only where it happens to matter today.
 */
export function repointRefs(tr: Transaction, doc: PMNode, from: string, to: string): void {
	if (!from || !to || from === to) return;
	tr.setMeta(renamesKey, { from, to });

	doc.descendants((node, pos) => {
		if (node.type.name === 'typ_ref') {
			if (node.attrs.target !== from) return;
			tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...node.attrs, target: to });
			return;
		}
		if (node.type.name !== 'ref' || node.textContent !== from) return;
		const at = tr.mapping.map(pos);
		tr.replaceWith(at, at + node.nodeSize, node.type.create(node.attrs, node.type.schema.text(to)));
	});
}

/** once the rename is dispatched, so the references in the project's other files follow */
export function announceLabelRenamed(from: string, to: string): void {
	if (!from || !to || from === to || typeof window === 'undefined') return;
	dispatchEvent(new CustomEvent('texpile:label-renamed', { detail: { from, to } }));
}

function labelCounts(doc: PMNode): Map<string, number> {
	const counts = new Map<string, number>();
	doc.descendants((node) => {
		const names = [node.type.name === 'label' ? node.attrs.name : node.attrs.label];
		if (Array.isArray(node.attrs.lineLabels)) names.push(...node.attrs.lineLabels);
		for (const n of names) if (typeof n === 'string' && n) counts.set(n, (counts.get(n) ?? 0) + 1);
	});
	return counts;
}

/** undo and redo of a rename take the uses in the project's other files along, as the rename did */
export const labelRenameUndo = new Plugin<ReadonlySet<string>>({
	key: renamesKey,
	state: {
		init: () => new Set(),
		apply(tr, names) {
			const r = tr.getMeta(renamesKey) as { from: string; to: string } | undefined;
			return r ? new Set([...names, r.from, r.to]) : names;
		}
	},
	appendTransaction(trs, before, after) {
		const names = renamesKey.getState(before);
		if (!names?.size || !trs.some(isHistoryTransaction)) return null;
		const was = labelCounts(before.doc);
		const now = labelCounts(after.doc);
		const gone = [...was].filter(([n, c]) => (now.get(n) ?? 0) < c).map(([n]) => n);
		const came = [...now].filter(([n, c]) => (was.get(n) ?? 0) < c).map(([n]) => n);
		if (gone.length === 1 && came.length === 1 && names.has(gone[0]) && names.has(came[0])) announceLabelRenamed(gone[0], came[0]);
		return null;
	}
});
