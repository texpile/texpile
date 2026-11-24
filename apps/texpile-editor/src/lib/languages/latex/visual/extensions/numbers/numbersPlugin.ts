// the numbers on the nodes that print one
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ChipCountsOf } from '$lib/editor/visual/extensions/drawnChips/footnote/footnoteNumbers';
import { typedInParagraph } from '$lib/editor/visual/extensions/nodeNumbers';

import { referencesLabel, referencesRange } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { documentCount, type LabelNumbers, type NumberingContext } from './documentNumbers';
import { readChipsAhead } from './numberEvents';

export type NumbersSetup = {
	/** what the last compile wrote to the .aux, and how the document numbers */
	context: () => NumberingContext;
	counts: ChipCountsOf;
	/** calls `redraw` when the context changes; returns the unsubscribe */
	onInputs: (redraw: () => void) => () => void;
};

// counted: false until the first count, which runs in the task after the state is made, apart from building the editor.
// stale: a change came within RECOUNT_MS of the last count, which the next count catches up with
type Numbers = { set: DecorationSet; counted: boolean; stale?: boolean };

/** keys in a raw block or chip can move a number: while they come, the whole document is counted this often */
const RECOUNT_MS = 300;

export const numbersKey = new PluginKey<Numbers>('texpile-numbers');

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

/** every step put inline content in place of inline content inside one node, so no numbered block came or went */
function editsInsideParents(tr: Transaction): boolean {
	return tr.steps.every((step, i) => {
		if (!(step instanceof ReplaceStep) || step.slice.openStart || step.slice.openEnd) return false;
		let inline = true;
		step.slice.content.forEach((node) => (inline &&= node.isInline));
		const $from = tr.docs[i].resolve(step.from);
		return inline && $from.parent.inlineContent && step.to <= $from.end();
	});
}

export function numbersPlugin(setup: NumbersSetup): Plugin<Numbers> {
	let countedAt = -Infinity;
	return new Plugin<Numbers>({
		key: numbersKey,
		state: {
			init: () => ({ set: DecorationSet.empty, counted: false }),
			apply: (tr, numbers) => {
				const asked = !!tr.getMeta(numbersKey);
				if (!tr.docChanged && !asked) return numbers;
				if (!numbers.counted && !asked) return numbers;
				if (!asked && typedInParagraph(tr)) return { ...numbers, set: numbers.set.map(tr.mapping, tr.doc) };
				if (!asked && performance.now() - countedAt < RECOUNT_MS && editsInsideParents(tr))
					return { set: numbers.set.map(tr.mapping, tr.doc), counted: true, stale: true };
				countedAt = performance.now();
				return { set: decorate(tr.doc, setup), counted: true };
			}
		},
		props: {
			decorations: (state) => numbersKey.getState(state)?.set
		},
		view(view) {
			function count(): void {
				if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(numbersKey, true).setMeta('addToHistory', false));
			}
			let reading: (() => void) | null = null;
			// the chips are read in slices first, so the count itself is one walk
			function countSoon(): void {
				if (reading !== null || numbersKey.getState(view.state)?.counted) return;
				reading = readChipsAhead(view.state.doc, () => {
					reading = null;
					if (!numbersKey.getState(view.state)?.counted) count();
				});
			}
			let again: ReturnType<typeof setTimeout> | null = null;
			let catchUp: ReturnType<typeof setTimeout> | null = null;
			function update(): void {
				countSoon();
				if (catchUp !== null || !numbersKey.getState(view.state)?.stale) return;
				catchUp = setTimeout(() => {
					catchUp = null;
					if (numbersKey.getState(view.state)?.stale) count();
				}, RECOUNT_MS);
			}
			// a change of what the count reads counts again in a task of its own, apart from the dispatch that changed it
			const stop = setup.onInputs(() => {
				if (again !== null) return;
				again = setTimeout(() => {
					again = null;
					count();
				});
			});
			countSoon();
			return {
				update,
				destroy: () => {
					stop();
					reading?.();
					if (again !== null) clearTimeout(again);
					if (catchUp !== null) clearTimeout(catchUp);
				}
			};
		}
	});
}
