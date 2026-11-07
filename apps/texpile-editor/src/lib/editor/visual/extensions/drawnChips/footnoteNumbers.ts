// the number each footnote prints, counted over the raw chips in document order and handed to each chip
// on a node decoration (`footnotes`, the chip's numbers joined by commas); the language reads a chip's counts
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const footnoteNumbersKey = new PluginKey<DecorationSet>('texpile-footnote-numbers');

export type ChipCounts = Record<string, (number | null)[]>;

export type ChipCountsOf = (source: string) => ChipCounts;

function numbered(doc: Node, countsOf: ChipCountsOf): DecorationSet {
	let counter = 0;
	const decorations: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'inline_latex' && node.type.name !== 'raw_latex') return true;
		const numbers = (countsOf(node.textContent).footnote ?? []).map((given) => given ?? ++counter);
		if (numbers.length) decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { footnotes: numbers.join(',') }));
		return false;
	});
	return DecorationSet.create(doc, decorations);
}

/** the numbers a chip's footnotes print, in the order they stand in it */
export function footnoteNumbersOf(decorations: readonly Decoration[]): string[] {
	const spec = decorations.find((d) => typeof d.spec.footnotes === 'string')?.spec.footnotes as string | undefined;
	return spec ? spec.split(',') : [];
}

export function footnoteNumbersPlugin(countsOf: ChipCountsOf): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key: footnoteNumbersKey,
		state: {
			init: (_, state) => numbered(state.doc, countsOf),
			apply: (tr, numbers) => (tr.docChanged ? numbered(tr.doc, countsOf) : numbers)
		},
		props: {
			decorations: (state) => footnoteNumbersKey.getState(state)
		}
	});
}
