// A suggestion that adds a comma or drops a word replaces the space beside it too; its mark is drawn over the words
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, type DecorationSet } from 'prosemirror-view';

/** the spaces at either end of a mark's text; none for a mark that is only spaces, which is what it marks */
export function blankEdges(text: string): { lead: number; trail: number } {
	const words = text.trim();
	if (!words) return { lead: 0, trail: 0 };
	const lead = text.length - text.trimStart().length;
	return { lead, trail: text.length - lead - words.length };
}

/** the class prosemirror-proofread gives a squiggle */
export function squiggleAttrs(squiggle: Decoration): { class: string } {
	const kind: string = squiggle.spec.errors[0].type;
	return { class: `proofread-${kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` };
}

const drawnSets = new WeakMap<DecorationSet, { doc: PMNode; drawn: DecorationSet }>();

/** prosemirror-proofread's marks as drawn; its own set, which a click reads, keeps the spaces it replaces */
export function marksOverWords(doc: PMNode, marks: DecorationSet): DecorationSet {
	const known = drawnSets.get(marks);
	if (known?.doc === doc) return known.drawn;
	const size = doc.content.size;
	const edged: Decoration[] = [];
	const trimmed: Decoration[] = [];
	for (const mark of marks.find()) {
		if (mark.to > size) continue;
		const { lead, trail } = blankEdges(doc.textBetween(mark.from, mark.to, 'x', 'x'));
		if (!lead && !trail) continue;
		edged.push(mark);
		trimmed.push(Decoration.inline(mark.from + lead, mark.to - trail, squiggleAttrs(mark), mark.spec));
	}
	const drawn = edged.length ? marks.remove(edged).add(doc, trimmed) : marks;
	drawnSets.set(marks, { doc, drawn });
	return drawn;
}
