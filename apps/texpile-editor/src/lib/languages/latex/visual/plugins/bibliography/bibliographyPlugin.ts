import { keyedEntriesInDoc, type KeyedEntry } from '$lib/languages/latex/visual/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import { BibKeyChipView } from './bibKeyChipView.svelte';
import BibliographyHeading from './BibliographyHeading.svelte';
import './bibliography.css';

const mounted = new WeakMap<globalThis.Node, ReturnType<typeof mount>>();
const keyChips = new WeakMap<globalThis.Node, BibKeyChipView>();
const liveKeyChips = new Set<BibKeyChipView>();

function unmountFrom(dom: globalThis.Node): void {
	const component = mounted.get(dom);
	if (component) void unmount(component);
}

function destroyKeyChip(dom: globalThis.Node): void {
	const chip = keyChips.get(dom);
	if (!chip) return;
	liveKeyChips.delete(chip);
	chip.destroy();
}

function chipWidget(entry: KeyedEntry): Decoration {
	return Decoration.widget(
		entry.pos + 2,
		(view: EditorView, getPos: () => number | undefined) => {
			const chip = new BibKeyChipView(view, () => (getPos() ?? 0) - 2, entry);
			keyChips.set(chip.dom, chip);
			liveKeyChips.add(chip);
			return chip.dom;
		},
		{
			side: -1,
			key: `bib-key:${entry.pos}`,
			stopEvent: () => true,
			ignoreSelection: true,
			destroy: destroyKeyChip
		}
	);
}

function headingWidget(pos: number): Decoration {
	return Decoration.widget(
		pos,
		() => {
			const dom = document.createElement('div');
			dom.className = 'bibliography-heading-host';
			mounted.set(dom, mount(BibliographyHeading, { target: dom }));
			return dom;
		},
		{
			side: -1,
			key: 'bibliography-heading',
			ignoreSelection: true,
			destroy: unmountFrom
		}
	);
}

function decorationsOf(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	for (const entry of keyedEntriesInDoc(doc)) {
		decorations.push(Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, { class: 'bib-entry' }));
		if (entry.node.firstChild?.isTextblock) decorations.push(chipWidget(entry));
		if (entry.starts && entry.cites) decorations.push(headingWidget(entry.pos));
	}
	return DecorationSet.create(doc, decorations);
}

const bibliographyKey = new PluginKey<DecorationSet>('bibliography');

export function bibliographyPlugin(): Plugin {
	return new Plugin({
		key: bibliographyKey,
		state: {
			init: (_config, state) => decorationsOf(state.doc),
			apply: (tr, old) => (tr.docChanged ? decorationsOf(tr.doc) : old)
		},
		props: {
			decorations: (state) => bibliographyKey.getState(state)
		},
		view: () => ({
			update: (view) => {
				const entries = new Map(keyedEntriesInDoc(view.state.doc).map((entry) => [entry.pos, entry]));
				for (const chip of liveKeyChips) {
					const entry = entries.get(chip.pos());
					if (entry) chip.refresh(entry);
				}
			}
		})
	});
}
