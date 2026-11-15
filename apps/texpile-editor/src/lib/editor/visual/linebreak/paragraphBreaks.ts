// where one paragraph's lines end, or why it is left to the browser
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { cssZoomOf } from '../lineBoxes';
import { breakLines } from './knuthPlass';
import { paragraphItems, type BreakMark, type ParagraphItems, type ParagraphMeasures } from './paragraphItems';
import type { StruckWords } from './struckWords';

export type ChosenBreaks = { marks: BreakMark[]; justified: boolean };
/** 'native': the browser wraps it, justified when the text is. 'untouched': the browser wraps it and nothing of ours applies */
export type ParagraphBreaks = ChosenBreaks | 'native' | 'untouched';

/** breaks the paragraph had before an edit, good as far as its text is unchanged (an offset like the marks') */
export type KeptBreaks = { marks: BreakMark[]; unchangedTo: number };

function sameMark(a: BreakMark, b: BreakMark): boolean {
	if (a.from !== b.from || a.to !== b.to || a.kind !== b.kind) return false;
	if (!a.inside || !b.inside) return a.inside === b.inside;
	return a.inside.key === b.inside.key && a.inside.from === b.inside.from && a.inside.to === b.inside.to;
}

export function sameBreaks(a: ParagraphBreaks, b: ParagraphBreaks): boolean {
	if (typeof a === 'string' || typeof b === 'string') return a === b;
	if (a.justified !== b.justified || a.marks.length !== b.marks.length) return false;
	return a.marks.every((mark, i) => sameMark(mark, b.marks[i]));
}

export type BreakingContext = ParagraphMeasures & {
	justified: boolean;
	/** the width of a block's content box */
	widthOf(block: HTMLElement): number;
};

// layout rounds to 1/64 px; this keeps a line that measures exactly full from spilling
const SLACK = 0.25;
// text set some other way (centered, say) is broken ragged, never justified
const JUSTIFIABLE_ALIGNMENTS = new Set(['start', 'left', 'justify', '-webkit-auto']);

// TeX's own order: no hyphens at \pretolerance, hyphens at \tolerance, then whatever fits, with LaTeX's \sloppy
// emergency stretch so that text with few spaces (Thai, say) still ranks its lines by how short they fall
const JUSTIFIED_PASSES = [
	{ tolerance: 100, hyphenate: false, sloppy: false },
	{ tolerance: 200, hyphenate: true, sloppy: false },
	{ tolerance: Infinity, hyphenate: true, sloppy: true }
];
// a ragged edge hides uneven spaces, so nothing is gained by splitting words for it
const RAGGED_PASSES = [{ tolerance: Infinity, hyphenate: false, sloppy: true }];
const EMERGENCY_STRETCH_EMS = 3;

// what the first line gives up before its first word: the indent, a heading's number, a theorem's run-in head, the key
// of a bibliography entry. The stylesheet or a widget draws most of these, so it is read off the page
function firstLineLead(view: EditorView, pos: number, block: HTMLElement, style: CSSStyleDeclaration): number {
	const indent = parseFloat(style.textIndent) || 0;
	// centered text starts its first line wherever the line's own length puts it
	if (style.direction === 'rtl' || !JUSTIFIABLE_ALIGNMENTS.has(style.textAlign)) return indent;
	try {
		const zoom = cssZoomOf(block);
		const edge =
			block.getBoundingClientRect().left / zoom + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
		const lead = view.coordsAtPos(pos + 1, 1).left / zoom - edge;
		return Number.isFinite(lead) ? Math.max(indent, lead) : indent;
	} catch {
		return indent;
	}
}

// the items the kept breaks sit on now, up to the first one the paragraph no longer offers (a word held whole, say)
function keptItems(built: ParagraphItems, kept: KeptBreaks): number[] {
	const offered = [...built.marks];
	const items: number[] = [];
	let next = 0;
	for (const mark of kept.marks) {
		if (mark.to > kept.unchangedTo) break;
		while (next < offered.length && offered[next][1].from < mark.from) next++;
		const [item, now] = offered[next] ?? [];
		if (item === undefined || !sameMark(now, mark)) break;
		items.push(item);
	}
	return items;
}

export function paragraphBreaks(
	view: EditorView,
	paragraph: PMNode,
	pos: number,
	block: HTMLElement,
	context: BreakingContext,
	struck: StruckWords[],
	kept?: KeptBreaks
): ParagraphBreaks {
	const style = getComputedStyle(block);
	// a heading is set ragged, as titlesec and KOMA set it
	const justified = context.justified && paragraph.type.name === 'paragraph' && JUSTIFIABLE_ALIGNMENTS.has(style.textAlign);
	const width = context.widthOf(block) - SLACK;
	const indent = firstLineLead(view, pos, block, style);
	const emergencyStretch = EMERGENCY_STRETCH_EMS * parseFloat(style.fontSize);
	const measures = justified ? context : { ...context, hyphenator: null };
	let built = paragraphItems(view, paragraph, pos, block, measures, struck);
	if (!built) return justified ? 'native' : 'untouched';
	// a word no line can hold is offered a split at any of its characters, the browser's own way out
	if (built.items.some((item) => item.kind === 'box' && item.width > width - indent))
		built = paragraphItems(view, paragraph, pos, block, { ...measures, splitWiderThan: width - indent }, struck) ?? built;
	const fixed = kept ? keptItems(built, kept) : [];
	// with nothing that fits after the kept lines, the whole paragraph is tried
	for (const lines of fixed.length > 0 ? [fixed, []] : [[]]) {
		for (const { tolerance, hyphenate, sloppy } of justified ? JUSTIFIED_PASSES : RAGGED_PASSES) {
			const pass = {
				tolerance,
				hyphenate,
				firstLineWidth: width - indent,
				lineWidth: width,
				emergencyStretch: sloppy ? emergencyStretch : 0
			};
			const breaks = breakLines(built.items, pass, lines.at(-1) ?? -1);
			if (!breaks) continue;
			const marks = [...lines, ...breaks].flatMap((item) => built.marks.get(item) ?? []);
			return { marks, justified };
		}
	}
	return justified ? 'native' : 'untouched';
}
