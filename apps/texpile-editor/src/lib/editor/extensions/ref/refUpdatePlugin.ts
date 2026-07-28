import { Plugin } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { triggerRefUpdate } from './refUpdateStore';
import { trailingDebounce } from '$lib/trailingDebounce';

function tablePositions(doc: Node): number[] {
	const positions: number[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'table_wrapper') positions.push(pos);
	});
	return positions;
}

// watches table positions and pokes ref displays when tables are added, removed, or reordered.
// the full-doc walk runs debounced: ref displays may lag a beat, typing may not.
export function createRefUpdatePlugin() {
	let lastTablePositions: number[] = [];

	const deferredCheck = trailingDebounce(300, (doc: Node) => {
		const next = tablePositions(doc);
		const changed = lastTablePositions.length !== next.length || lastTablePositions.some((pos, i) => pos !== next[i]);
		if (changed) {
			lastTablePositions = next;
			triggerRefUpdate();
		}
	});

	return new Plugin({
		state: {
			init(_, state) {
				lastTablePositions = tablePositions(state.doc);
				return null;
			},
			apply(tr) {
				if (tr.docChanged) deferredCheck(tr.doc);
				return null;
			}
		},
		view: () => ({ destroy: () => deferredCheck.cancel() })
	});
}
