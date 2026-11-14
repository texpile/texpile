// the numbers on the nodes that print one
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ChipCountsOf } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { typedInParagraph } from '$lib/editor/visual/extensions/nodeNumbers';
import { referencesLabel, referencesRange } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { documentCount, type LabelNumbers, type NumberingContext } from './documentNumbers';

export type NumbersSetup = {
	/** what the last compile wrote to the .aux, and how the document numbers */
	context: () => NumberingContext;
	counts: ChipCountsOf;
	/** calls `redraw` when the context changes; returns the unsubscribe */
	onInputs: (redraw: () => void) => () => void;
};

export const numbersKey = new PluginKey<DecorationSet>('texpile-numbers');

const REFERENCE = /\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*)*\{([^{}]*)\}(?:\s*\{([^{}]*)\})?/g;
const referenced = new WeakMap<PMNode, readonly string[]>();

// the labels a node's references name: a \ref's own, a chip's by the commands in its source
function referencedLabels(node: PMNode): readonly string[] {
	let labels = referenced.get(node);
	if (labels) return labels;
	const found: string[] = [];
	if (node.type.name === 'ref') found.push(node.textContent);
	else {
		for (const [, name, first, second] of node.textContent.matchAll(REFERENCE)) {
			if (!referencesLabel(name)) continue;
			found.push(...first.split(','), ...(second && referencesRange(name) ? [second] : []));
		}
	}
	labels = found.map((label) => label.trim()).filter(Boolean);
	referenced.set(node, labels);
	return labels;
}

/** the numbers the editor's own count gives labels, handed to a node that references one of them */
export function countedLabelsOf(decorations: readonly Decoration[]): LabelNumbers | null {
	for (const decoration of decorations) {
		const counted = (decoration.spec as { counted?: LabelNumbers }).counted;
		if (counted) return counted;
	}
	return null;
}

function decorate(doc: PMNode, setup: NumbersSetup): DecorationSet {
	const decorations: Decoration[] = [];
	const { numbers: counted, labels } = documentCount(doc, setup.counts, setup.context());
	for (const [pos, numbers] of counted) {
		const node = doc.nodeAt(pos);
		if (!node) continue;
		const end = pos + node.nodeSize;
		const name = node.type.name;
		if (name === 'inline_latex' || name === 'raw_latex') decorations.push(Decoration.node(pos, end, {}, { footnotes: numbers.join(',') }));
		else if (name === 'heading' || name === 'image')
			decorations.push(Decoration.node(pos, end, { 'data-number': numbers[0] }, { numbers }));
		else decorations.push(Decoration.node(pos, end, {}, { numbers }));
	}
	if (labels.size)
		doc.descendants((node, pos) => {
			const name = node.type.name;
			if (name !== 'ref' && name !== 'inline_latex' && name !== 'raw_latex') return true;
			if (referencedLabels(node).some((label) => labels.has(label)))
				decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { counted: labels }));
			return false;
		});
	return DecorationSet.create(doc, decorations);
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
