import { editsInsideTextblocks, keyedEntriesInDoc, type KeyedEntry } from '$lib/languages/latex/visual/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { headOf } from './bibKeyPanel';
import { headingForm, keyChipForm } from './canvas/bibWidgets';

// an entry is a paragraph with a hanging indent, with no list marker
const ENTRY_STYLE = 'display: block; margin-left: 0';
const FIRST_LINE_STYLE = 'margin-top: 0; margin-bottom: 0.5rem; padding-left: 1.5em; text-indent: -1.5em';

function placeholder(): HTMLElement {
	return document.createElement('span');
}

function chipWidget(entry: KeyedEntry): Decoration {
	return Decoration.widget(entry.pos + 2, placeholder, {
		side: -1,
		// the key in the widget's key: a renamed entry draws its new chip
		key: `bib-key:${entry.pos}:${headOf(entry.node).key}`,
		ignoreSelection: true,
		canvas: keyChipForm(entry)
	});
}

function headingWidget(pos: number): Decoration {
	return Decoration.widget(pos, placeholder, { side: -1, key: 'bibliography-heading', ignoreSelection: true, canvas: headingForm });
}

function decorationsOf(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	for (const entry of keyedEntriesInDoc(doc)) {
		decorations.push(Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, { class: 'bib-entry', style: ENTRY_STYLE }));
		const first = entry.node.firstChild;
		if (first?.isTextblock) {
			decorations.push(Decoration.node(entry.pos + 1, entry.pos + 1 + first.nodeSize, { style: FIRST_LINE_STYLE }));
			decorations.push(chipWidget(entry));
		}
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
			// a paper's every key: text typed into a textblock moves the entries and changes none
			apply: (tr, old) => (!tr.docChanged ? old : editsInsideTextblocks(tr) ? old.map(tr.mapping, tr.doc) : decorationsOf(tr.doc))
		},
		props: {
			decorations: (state) => bibliographyKey.getState(state)
		}
	});
}
