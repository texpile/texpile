import type { Node } from 'prosemirror-model';
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';

function hasText(node: Node | null): boolean {
	return node?.type.name === 'paragraph' && node.content.size > 0;
}

function changedRanges(mapping: Mapping): [number, number][] {
	const ranges: [number, number][] = [];
	mapping.maps.forEach((map, i) => {
		const rest = mapping.slice(i + 1);
		map.forEach((_a, _b, from, to) => ranges.push([rest.map(from, -1), rest.map(to, 1)]));
	});
	return ranges;
}

function sameParagraphBefore(old: Node, back: Mapping, a: number, b: number): boolean {
	const $a = old.resolve(back.map(a, -1));
	const $b = old.resolve(back.map(b, 1));
	return $a.parent === $b.parent && $a.parent.type.name === 'paragraph';
}

export function placeDisplays(trs: readonly Transaction[], before: EditorState, after: EditorState): Transaction | null {
	if (!trs.some((tr) => tr.docChanged)) return null;
	const mapping = new Mapping();
	for (const tr of trs) mapping.appendMapping(tr.mapping);
	const back = mapping.invert();
	let tr: Transaction | null = null;
	for (const [from, to] of changedRanges(mapping)) {
		after.doc.nodesBetween(from, Math.min(to, after.doc.content.size), (node, pos, parent, index) => {
			if (node.type.name !== 'block_math') return !node.isTextblock;
			if (!parent || (node.attrs.inParagraph !== null && node.attrs.continuesAfter !== null)) return false;
			const prev = index > 0 ? parent.child(index - 1) : null;
			const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
			const end = pos + node.nodeSize;
			const split = hasText(prev) && hasText(next) && sameParagraphBefore(before.doc, back, pos - 1, end + 1);
			const attrs = {
				...node.attrs,
				inParagraph: node.attrs.inParagraph ?? hasText(prev),
				continuesAfter: node.attrs.continuesAfter ?? (split || !hasText(next))
			};
			tr = (tr ?? after.tr).setNodeMarkup(pos, undefined, attrs);
			return false;
		});
	}
	return tr;
}

export const displayPlacement = new Plugin({ appendTransaction: placeDisplays });
