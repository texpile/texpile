// the end-of-proof square at the end of the proof's last paragraph, floated to the right edge of its last line
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { StyleLook } from '$lib/editor/canvas';
import { editsInsideTextblocks } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { environmentLook } from '../environmentLook';

const QED_LOOK: StyleLook = { float: 'right', marginLeft: '1em' };
const key = new PluginKey<DecorationSet>('proof-end-mark');

function marksOf(doc: PMNode): DecorationSet {
	const heads = templateFeaturesStore.current.environmentHeads;
	const decorations: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'environment') return !node.isTextblock;
		const look = environmentLook(String(node.attrs.name ?? ''), String(node.attrs.args ?? ''), heads);
		const last = node.lastChild;
		if (look.kind === 'proof' && last?.type.name === 'paragraph') {
			const end = pos + node.nodeSize - 1;
			decorations.push(Decoration.node(end - last.nodeSize, end, {}, { canvasAfter: { text: '∎', look: QED_LOOK } }));
		}
		return true;
	});
	return DecorationSet.create(doc, decorations);
}

export function proofEndMarkPlugin(): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key,
		state: {
			init: (_, state) => marksOf(state.doc),
			apply: (tr, set) => {
				if (!tr.docChanged) return set;
				return editsInsideTextblocks(tr) ? set.map(tr.mapping, tr.doc) : marksOf(tr.doc);
			}
		},
		props: { decorations: (state) => key.getState(state) }
	});
}
