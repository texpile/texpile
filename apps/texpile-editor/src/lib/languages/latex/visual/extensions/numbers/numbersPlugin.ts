// the numbers on the nodes that print one
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { documentNumbers, type NumberingContext } from './documentNumbers';

export type NumbersSetup = {
	/** what the last compile wrote to the .aux, and how the document numbers */
	context: () => NumberingContext;
	footnoteMarks: (source: string) => (number | null)[];
	/** calls `redraw` when the context changes; returns the unsubscribe */
	onInputs: (redraw: () => void) => () => void;
};

export const numbersKey = new PluginKey<DecorationSet>('texpile-numbers');

function decorate(doc: PMNode, setup: NumbersSetup): DecorationSet {
	const decorations: Decoration[] = [];
	for (const [pos, numbers] of documentNumbers(doc, setup.footnoteMarks, setup.context())) {
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

export function numbersPlugin(setup: NumbersSetup): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: numbersKey,
		state: {
			init: (_, state) => decorate(state.doc, setup),
			apply: (tr, set) => (tr.docChanged || tr.getMeta(numbersKey) ? decorate(tr.doc, setup) : set)
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
