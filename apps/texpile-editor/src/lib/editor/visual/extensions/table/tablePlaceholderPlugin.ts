import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const key = new PluginKey<DecorationSet>('table-placeholder');

type EmptyPart = { at: number; text: string; normalWeight: boolean };

const TEXT: Record<string, { text: string; normalWeight: boolean }> = {
	table_caption: { text: 'Caption: Click to edit', normalWeight: true },
	table_notes: { text: 'Notes: Click to add notes', normalWeight: false }
};

// what a top-level block holds, kept while it is the same node: an edit reads one block again
const inBlock = new WeakMap<Node, EmptyPart[]>();

function emptyPartsIn(block: Node): EmptyPart[] {
	let found = inBlock.get(block);
	if (found) return found;
	found = [];
	const list = found;
	block.descendants((node, pos) => {
		const part = TEXT[node.type.name];
		if (part && node.content.size === 0) list.push({ at: pos + 1, ...part });
	});
	inBlock.set(block, found);
	return found;
}

function placeholder(part: EmptyPart): HTMLElement {
	const span = document.createElement('span');
	span.className = 'table-placeholder';
	span.textContent = part.text;
	span.style.color = 'var(--faint-text)';
	span.style.fontStyle = 'italic';
	if (part.normalWeight) span.style.fontWeight = 'normal';
	return span;
}

function decorate(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	doc.forEach((block, offset) => {
		for (const part of emptyPartsIn(block))
			decorations.push(Decoration.widget(offset + 1 + part.at, () => placeholder(part), { key: part.text }));
	});
	return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export function tablePlaceholderPlugin() {
	return new Plugin<DecorationSet>({
		key,
		state: {
			init: (_, state) => decorate(state.doc),
			apply: (tr, set) => (tr.docChanged ? decorate(tr.doc) : set)
		},
		props: { decorations: (state) => key.getState(state) }
	});
}
