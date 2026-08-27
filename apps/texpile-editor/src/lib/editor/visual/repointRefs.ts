import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

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
