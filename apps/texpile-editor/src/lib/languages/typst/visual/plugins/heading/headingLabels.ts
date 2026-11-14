// a heading's <label> drawn after its words, as LaTeX's \label shows under a heading
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { labelFace, typedInParagraph, type ChipFace } from '$lib/languages/typst/visual/core';

const faces = new WeakMap<globalThis.Node, ChipFace>();

function labelChip(name: string): HTMLElement {
	const face = labelFace(name);
	face.dom.classList.add('ml-2', 'align-middle', 'font-normal');
	face.dom.contentEditable = 'false';
	faces.set(face.dom, face);
	return face.dom;
}

function labelsIn(doc: Node): DecorationSet {
	const widgets: Decoration[] = [];
	doc.descendants((node, pos) => {
		const label = node.type.name === 'heading' && typeof node.attrs.label === 'string' ? node.attrs.label : '';
		if (label)
			widgets.push(
				Decoration.widget(pos + node.nodeSize - 1, () => labelChip(label), {
					side: 1,
					key: `heading-label:${label}`,
					destroy: (dom) => faces.get(dom)?.destroy?.()
				})
			);
		return !node.isTextblock;
	});
	return widgets.length ? DecorationSet.create(doc, widgets) : DecorationSet.empty;
}

const key = new PluginKey<DecorationSet>('typst-heading-labels');

export const headingLabelsPlugin = new Plugin<DecorationSet>({
	key,
	state: {
		init: (_config, state) => labelsIn(state.doc),
		apply: (tr, shown) => (!tr.docChanged ? shown : typedInParagraph(tr) ? shown.map(tr.mapping, tr.doc) : labelsIn(tr.doc))
	},
	props: { decorations: (state) => key.getState(state) }
});
