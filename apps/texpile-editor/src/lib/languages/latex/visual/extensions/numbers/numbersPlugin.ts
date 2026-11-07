// the numbers on the nodes that print one
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ChipCountsOf } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { documentNumbers, type NumberingContext } from './documentNumbers';

export type NumbersSetup = {
	/** what the last compile wrote to the .aux, and how the document numbers */
	context: () => NumberingContext;
	/** what a chip adds to each counter */
	counts: ChipCountsOf;
	/** calls `redraw` when the context changes; returns the unsubscribe */
	onInputs: (redraw: () => void) => () => void;
};

export const numbersKey = new PluginKey<DecorationSet>('texpile-numbers');

function decorate(doc: PMNode, setup: NumbersSetup): DecorationSet {
	const decorations: Decoration[] = [];
	for (const [pos, numbers] of documentNumbers(doc, setup.counts, setup.context())) {
		const node = doc.nodeAt(pos);
		if (!node) continue;
		const end = pos + node.nodeSize;
		const name = node.type.name;
		if (name === 'inline_latex' || name === 'raw_latex') decorations.push(Decoration.node(pos, end, {}, { footnotes: numbers.join(',') }));
		else if (name === 'heading' || name === 'image')
			decorations.push(Decoration.node(pos, end, { 'data-number': numbers[0] }, { numbers }));
		else decorations.push(Decoration.node(pos, end, {}, { numbers }));
	}
	return DecorationSet.create(doc, decorations);
}

function onlyText(fragment: PMNode['content']): boolean {
	return fragment.content.every((n) => n.isText);
}

/** text typed or deleted inside a paragraph, which no count reads, so the numbers only move */
function typedInParagraph(tr: Transaction): boolean {
	return tr.steps.every((step, i) => {
		if (!(step instanceof ReplaceStep) || !onlyText(step.slice.content)) return false;
		const doc = tr.docs[i];
		const $from = doc.resolve(step.from);
		return (
			$from.parent.type.name === 'paragraph' && $from.sameParent(doc.resolve(step.to)) && onlyText(doc.slice(step.from, step.to).content)
		);
	});
}

export function numbersPlugin(setup: NumbersSetup): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: numbersKey,
		state: {
			init: (_, state) => decorate(state.doc, setup),
			apply: (tr, set) => {
				if (!tr.docChanged && !tr.getMeta(numbersKey)) return set;
				return !tr.getMeta(numbersKey) && typedInParagraph(tr) ? set.map(tr.mapping, tr.doc) : decorate(tr.doc, setup);
			}
		},
		props: {
			decorations: (state) => numbersKey.getState(state)
		},
		view(view) {
			const stop = setup.onInputs(() => {
				if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(numbersKey, true).setMeta('addToHistory', false));
			});
			return { destroy: stop };
		}
	});
}
