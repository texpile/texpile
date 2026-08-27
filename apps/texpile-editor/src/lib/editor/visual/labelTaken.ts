import type { Node as PMNode } from 'prosemirror-model';

/**
 * Something else in the document already answers to this name.
 *
 * Across ALL the things that carry a label, not just the kind being renamed: two different anchors
 * sharing a name means every reference to it resolves to whichever LaTeX saw last, and the editor
 * would draw both as valid. The float panels each checked only their own kind, which is why this
 * looks wider than what it replaces.
 */
export function labelTaken(doc: PMNode, name: string, ownPos: number): boolean {
	if (!name) return false;

	let taken = false;
	doc.descendants((node, pos) => {
		if (taken) return false;
		if (pos === ownPos) return;
		// the label chip keeps its name in `name`; every float keeps its own in `label`
		if ((node.type.name === 'label' ? node.attrs.name : node.attrs.label) === name) taken = true;
		// an align-family equation carries one label per line
		else if (Array.isArray(node.attrs.lineLabels) && node.attrs.lineLabels.includes(name)) taken = true;
	});
	return taken;
}
