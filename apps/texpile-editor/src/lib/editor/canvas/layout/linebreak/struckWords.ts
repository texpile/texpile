// a suggestion's struck out words and removed line ends inside one textblock, from the frame's widgets (9.4)
import type { Mark } from 'prosemirror-model';
import type { WidgetDecorationView } from '../../contracts/decorationTypes';
import { LEAF_CHARACTER } from '../text/wordSegments';

export type StruckRun = { readonly text: string; readonly marks: readonly Mark[] };

export type StruckWords = {
	/** one widget's words; a suggestion can have several ranges in a paragraph, so its id alone names none of them */
	readonly key: string;
	/** the content offset the words sit at, between two characters */
	readonly at: number;
	readonly side: number;
	readonly look: 'oldWords' | 'removedBreak';
	readonly runs: readonly StruckRun[];
	/** the suggestion's tint behind the words */
	readonly tint: string;
	/** no words: a removed break drawn as the line end it was, which the line breaker ends a line at too */
	readonly lineEnd: boolean;
};

/** in text order; positions are the document's, contentStart the textblock's first content position */
export function struckWordsIn(widgets: readonly WidgetDecorationView[], contentStart: number, contentEnd: number): StruckWords[] {
	const found: StruckWords[] = [];
	for (const widget of widgets) {
		const form = widget.spec.canvas;
		const at = widget.pos - contentStart;
		if (form?.kind === 'lineEnd' && widget.pos > contentStart && widget.pos < contentEnd)
			found.push({ key: `end ${at}`, at, side: widget.side, look: 'removedBreak', runs: [], tint: '', lineEnd: true });
		if (form?.kind !== 'struck' || widget.pos < contentStart || widget.pos > contentEnd) continue;
		const runs: StruckRun[] = [];
		// atoms among the old words stand as their text, or as one object character
		form.runs.forEach((node) => runs.push({ text: node.isText ? node.text! : node.textContent || LEAF_CHARACTER, marks: node.marks }));
		found.push({ key: `${form.id} ${widget.pos}`, at, side: widget.side, look: form.look, runs, tint: form.tint, lineEnd: false });
	}
	return found.sort((a, b) => a.at - b.at || a.side - b.side);
}
