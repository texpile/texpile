// the labels a reference can point at: this document's own, the project's other files', and the compiled .aux's
import type { Node } from 'prosemirror-model';
import type { ProjectIntel } from '$lib/languages/latex/visual/core';
export function knownLabels(doc: Node, intel: ProjectIntel): string[] {
	const names = new Set<string>();
	doc.descendants((node) => {
		// the label chip keeps its name in `name`; every float keeps its own in `label`
		const own = node.type.name === 'label' ? node.attrs.name : node.attrs.label;
		if (typeof own === 'string' && own) names.add(own);
		if (Array.isArray(node.attrs.lineLabels)) for (const line of node.attrs.lineLabels) if (line) names.add(line);
	});
	for (const label of intel.labels) names.add(label.name);
	for (const label of Object.keys(intel.auxNumbers)) names.add(label);
	return [...names].sort();
}
