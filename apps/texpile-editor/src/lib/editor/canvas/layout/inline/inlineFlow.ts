// an inline formatting context laid out: its objects, then per flow the breaks, fragments and line boxes
import type { Node as PMNode } from 'prosemirror-model';
import type { LayoutBoxBuilder, LineFragment, TextMeasure } from '../../contracts/layoutTypes';
import type { ComputedStyle, RunStyle } from '../../contracts/styleTypes';
import type { FaceElement } from '../../tree/faceElement';
import type { Hyphenator } from '../linebreak/liangHyphenation';
import type { FontMetricsReader } from '../text/fontMetrics';
import { canvasFontOf } from '../text/fontStrings';
import { graphemeCount } from '../text/graphemes';
import { splitAroundBlocks, type FlowPart } from './blockInInline';
import { breakProfileOf, type BreakProfile } from './breakProfiles';
import { runStyleOf, type InlinePiece } from './inlineContent';
import { placeLineFragments, type PlacedLine, type PlacedObject } from './inlineFragments';
import { inlineItems, type DocumentRange } from './inlineItems';
import type { KeptBreaks } from './keptBreaks';
import { chooseLines } from './lineBreaking';
import { stackLines } from './lineBoxes';
import { firstLineInset, type FirstLineInset } from '../floats';
import { tabAdvanceAt, transformedText, wrapsLines } from './whiteSpace';

export type InlineFlowContext = {
	readonly measure: TextMeasure;
	readonly metrics: FontMetricsReader;
	readonly justify: boolean;
	/** the document language's patterns; null when hyphenation is off */
	readonly hyphenator: Hyphenator | null;
	readonly kept: KeptBreaks | null;
	/** the top-level block's position, for the kept word and composition ranges */
	readonly blockPos: number;
	readonly pixelRatio: number;
	/** an object's box laid out at its shrink-to-fit width (inline-block, replaced, an inline face) */
	readonly layoutObject: (element: FaceElement, style: ComputedStyle, available: number) => LayoutBoxBuilder;
};

export type InlineFlowSource = {
	/** the textblock; null for a face's own inline content */
	readonly node: PMNode | null;
	/** the textblock's offset from the top-level block's start */
	readonly offset: number;
	readonly pieces: readonly InlinePiece[];
};

const SPACES = / /g;

export function measureRun(measure: TextMeasure, run: RunStyle, text: string): number {
	const drawn = transformedText(text, run.textTransform) ?? text;
	let width = measure(run.fontString, drawn);
	if (run.letterSpacing) width += run.letterSpacing * graphemeCount(drawn);
	if (run.wordSpacing) width += run.wordSpacing * (drawn.match(SPACES)?.length ?? 0);
	return width;
}

function placeObject(piece: InlinePiece, context: InlineFlowContext, available: number): PlacedObject | null {
	if (piece.kind === 'generated')
		return { box: null, width: measureRun(context.measure, piece.run, piece.text) + piece.edges, ascent: 0, descent: 0 };
	if (piece.kind !== 'object') return null;
	const box = context.layoutObject(piece.element, piece.style, available);
	const width = box.margin.left + box.width + box.margin.right;
	// an atomic inline's baseline is its last line's, else its bottom margin edge (CSS 2.2 10.8.1)
	const baseline = box.baselines && box.style.layout.overflowY === 'visible' ? box.baselines.last : box.height;
	const ascent = box.margin.top + baseline;
	return { box, width, ascent, descent: box.margin.top + box.height + box.margin.bottom - ascent };
}

function documentRanges(context: InlineFlowContext): { whole: DocumentRange[]; unbroken: DocumentRange | null } {
	const { kept, blockPos } = context;
	const whole = kept?.wholeWord ? [{ from: kept.wholeWord.from - blockPos, to: kept.wholeWord.to - blockPos }] : [];
	const unbroken = kept?.composition ? { from: kept.composition.from - blockPos, to: kept.composition.to - blockPos } : null;
	if (unbroken) whole.push(unbroken);
	return { whole, unbroken };
}

function flowLines(
	part: FlowPart & { kind: 'flow' },
	source: InlineFlowSource,
	draft: LayoutBoxBuilder,
	context: InlineFlowContext,
	geometry: { width: number; indent: number; first: boolean; profile: BreakProfile; inset: FirstLineInset | null }
): PlacedLine[] {
	const { pieces } = part;
	const style = draft.style.layout;
	const objects = new Map<number, PlacedObject>();
	pieces.forEach((piece, i) => {
		const placed = placeObject(piece, context, geometry.width);
		if (placed) objects.set(i, placed);
	});
	function measureText(index: number, text: string): number {
		const piece = pieces[index];
		return piece.kind === 'text' || piece.kind === 'generated' ? measureRun(context.measure, piece.run, text) : 0;
	}
	const { profile } = geometry;
	const { whole, unbroken } = documentRanges(context);
	const held = profile.breaker === 'knuthPlass';
	const node = source.node;
	const kept = held && node && geometry.first ? context.kept?.take(node) : undefined;
	// a float beside the first line takes its room, as the indent does
	const beside = geometry.first && geometry.inset ? geometry.inset : { left: 0, right: 0 };
	const first = geometry.first ? geometry.width - geometry.indent - beside.left - beside.right : geometry.width;
	const indent = geometry.first ? geometry.indent + beside.left : 0;
	const tabSpace = measureRun(context.measure, runStyleOf(draft.style), ' ');
	function tabAdvance(x: number): number {
		return tabAdvanceAt(x, tabSpace);
	}
	const chosen = chooseLines(
		(splitWiderThan) =>
			inlineItems(pieces, {
				measureText,
				widthOf: (index) => objects.get(index)?.width ?? 0,
				hyphenator: profile.hyphenate ? context.hyphenator : null,
				wholeWords: whole,
				unbroken,
				splitWiderThan,
				held,
				textblockOffset: source.offset
			}),
		{
			profile,
			widths: { first, rest: geometry.width },
			fontSize: style.font.sizePx,
			wraps: wrapsLines(style.whiteSpace),
			splitsLongWords: held || style.overflowWrap !== 'normal' || style.wordBreak === 'break-word',
			kept,
			tabAdvance,
			indent
		}
	);
	if (held && node && geometry.first && context.kept) context.kept.record(node, { sites: chosen.sites, width: geometry.width });
	return placeLineFragments({
		chosen,
		pieces,
		objects,
		measureText,
		profile,
		style,
		widths: { first, rest: geometry.width },
		lineLeft: (line) => (line === 0 ? indent : 0),
		emptyAt: source.offset + 1,
		tabAdvance
	});
}

function blockLine(part: FlowPart & { kind: 'block' }, context: InlineFlowContext, width: number): PlacedLine {
	const placed = placeObject(part.object, context, width)!;
	const box = placed.box!;
	const fragment: LineFragment = {
		kind: 'atomic',
		x: 0,
		width: part.alone ? width : placed.width,
		ascent: placed.ascent,
		descent: placed.descent,
		box,
		from: part.object.at,
		to: part.object.at + part.object.size
	};
	return {
		fragments: [fragment],
		hyphen: null,
		from: part.object.at,
		to: part.object.at + part.object.size,
		forced: true,
		own: part.alone ? 'alone' : 'block'
	};
}

/** sets the box's lines and baselines; returns the content height */
export function layoutInlineFlow(
	draft: LayoutBoxBuilder,
	source: InlineFlowSource,
	context: InlineFlowContext,
	contentWidth: number
): number {
	const style = draft.style.layout;
	const profile = breakProfileOf(source.node, style, { justify: context.justify, hyphenate: context.hyphenator !== null });
	// an inline element drawn as a box of its own (a widget's root) starts no line, so the text-indent it inherits stays out
	const indent = style.display === 'inline' ? 0 : style.textIndent.px + (style.textIndent.percent / 100) * contentWidth;
	const inset = firstLineInset(draft);
	const lines: PlacedLine[] = [];
	let first = true;
	for (const part of splitAroundBlocks(source.pieces)) {
		if (part.kind === 'block') lines.push(blockLine(part, context, contentWidth));
		else lines.push(...flowLines(part, source, draft, context, { width: contentWidth, indent, first, profile, inset }));
		first = false;
	}
	if (!lines.length) lines.push({ fragments: [], hyphen: null, from: source.offset + 1, to: source.offset + 1, forced: true });
	const left = style.borderWidth.left + style.padding.left.px;
	const top = style.borderWidth.top + style.padding.top.px;
	const spaceWidth = context.measure(canvasFontOf(style.font), ' ');
	const { boxes, bottom } = stackLines(lines, { style, metrics: context.metrics, pixelRatio: context.pixelRatio, spaceWidth }, top);
	boxes.forEach((line, index) => {
		for (const fragment of line.fragments) {
			fragment.x += left;
			if (fragment.kind !== 'atomic' && fragment.kind !== 'widget') continue;
			const box = fragment.box as LayoutBoxBuilder | null;
			if (!box) continue;
			box.x = fragment.x + box.margin.left;
			const ascent = fragment.kind === 'atomic' ? fragment.ascent : box.margin.top + (box.baselines?.last ?? box.height);
			box.y = lines[index].own === 'alone' ? line.y + box.margin.top : line.baseline - ascent + box.margin.top;
		}
	});
	draft.lines = boxes;
	draft.baselines = { first: boxes[0].baseline, last: boxes.at(-1)!.baseline };
	return bottom - top;
}
