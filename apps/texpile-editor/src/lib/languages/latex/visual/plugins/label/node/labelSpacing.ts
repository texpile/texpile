import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const key = new PluginKey<DecorationSet>('label-spacing');

function touches(text: string | undefined): boolean {
	return !!text && /\S/.test(text);
}

// what a top-level block holds, kept while it is the same node: an edit reads one block again
const inBlock = new WeakMap<PMNode, [number, string][]>();

function gluedIn(block: PMNode): [number, string][] {
	let found = inBlock.get(block);
	if (found) return found;
	found = [];
	const list = found;
	block.descendants((node, pos, parent, index) => {
		if (node.type.name !== 'label' || !parent) return true;
		const before = index > 0 ? parent.child(index - 1) : null;
		const after = index + 1 < parent.childCount ? parent.child(index + 1) : null;
		const sides = [touches(before?.text?.at(-1)) && 'before', touches(after?.text?.[0]) && 'after'].filter(Boolean).join(' ');
		if (sides) list.push([pos, sides]);
		return false;
	});
	inBlock.set(block, found);
	return found;
}

export function gluedLabels(doc: PMNode): Map<number, string> {
	const out = new Map<number, string>();
	doc.forEach((block, offset) => {
		for (const [pos, sides] of gluedIn(block)) out.set(offset + 1 + pos, sides);
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
