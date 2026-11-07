// \label prints nothing, so text written against it (LyX's \label{x}Let) reads apart from the chip by a word space
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const key = new PluginKey<DecorationSet>('label-spacing');

function touches(text: string | undefined): boolean {
	return !!text && /\S/.test(text);
}

/** the sides of each label that text touches, as `before after` */
export function gluedLabels(doc: PMNode): Map<number, string> {
	const out = new Map<number, string>();
	doc.descendants((node, pos, parent, index) => {
		if (node.type.name !== 'label' || !parent) return true;
		const before = index > 0 ? parent.child(index - 1) : null;
		const after = index + 1 < parent.childCount ? parent.child(index + 1) : null;
		const sides = [touches(before?.text?.at(-1)) && 'before', touches(after?.text?.[0]) && 'after'].filter(Boolean).join(' ');
		if (sides) out.set(pos, sides);
		return false;
	});
	return out;
}

function decorate(doc: PMNode): DecorationSet {
	const decorations = [...gluedLabels(doc)].map(([pos, sides]) => Decoration.node(pos, pos + 1, { 'data-glued': sides }));
	return DecorationSet.create(doc, decorations);
}

export function labelSpacingPlugin(): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key,
		state: {
			init: (_, state) => decorate(state.doc),
			apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set)
		},
		props: { decorations: (state) => key.getState(state) }
	});
}
