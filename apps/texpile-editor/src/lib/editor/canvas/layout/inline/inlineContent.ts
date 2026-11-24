// a textblock's inline content in document order (5.3)
import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { FrameDecorations, InlineDecorationView, WidgetDecorationView } from '../../contracts/decorationTypes';
import type { PositionMap } from '../../contracts/layoutTypes';
import type { ComputedStyle, RunStyle, CanvasStyles, StyleLook } from '../../contracts/styleTypes';
import { changesLayout, decorationLevel } from '../../decorations/decorationRuns';
import { islandHighlighterOf, tokenLookOf } from '../../islands/islandHighlight';
import { FaceElement } from '../../tree/faceElement';
import { chainOf, levelOfElement, type LevelOfChain, type MarkViewDescs } from '../../tree/markViewDesc';
import { struckWordsIn } from '../linebreak/struckWords';
import { canvasFontOf } from '../text/fontStrings';

export type InlineText = {
	readonly kind: 'text';
	/** offsets from the top-level block's start; struck words and a face's own text cover none */
	readonly from: number;
	readonly to: number;
	readonly text: string;
	readonly run: RunStyle;
	/** inline padding, border and margin of the levels that open before this text and close after it */
	readonly edgeStart: number;
	readonly edgeEnd: number;
	/** the widget key of a suggestion's struck words */
	readonly struck: string | null;
};
export type InlineObject = {
	readonly kind: 'object';
	readonly at: number;
	/** the node's size; 0 for a widget */
	readonly size: number;
	readonly element: FaceElement;
	readonly style: ComputedStyle;
	/** a widget's side; null for an inline node */
	readonly side: number | null;
};
/** hard_break (size 1) or a suggestion's removed line end (size 0) */
export type InlineBreak = { readonly kind: 'break'; readonly at: number; readonly size: number };
export type InlineGenerated = {
	readonly kind: 'generated';
	readonly at: number;
	readonly text: string;
	readonly style: ComputedStyle;
	readonly run: RunStyle;
	readonly edges: number;
};
export type InlinePiece = InlineText | InlineObject | InlineBreak | InlineGenerated;

export type TextblockSource = {
	readonly node: PMNode;
	/** offset before the textblock from the top-level block's start */
	readonly offset: number;
	/** the element whose hole holds the text: run style chains hang from it */
	readonly hole: FaceElement;
	readonly blockPos: number;
	readonly styles: CanvasStyles;
	readonly marks: MarkViewDescs;
	readonly positions: PositionMap;
	readonly widgets: ReadonlyMap<FaceElement, WidgetDecorationView>;
	readonly decorations: FrameDecorations;
	/** the text of a pseudo-element of the hole, attr() and counters resolved */
	readonly generated: (pseudo: 'before' | 'after') => InlineGenerated | null;
};

type InlineEvent = { readonly at: number; readonly side: number; readonly pieces: () => InlinePiece[] };
/** a highlight span of island text, offsets from the top-level block's start */
type TokenRun = { readonly from: number; readonly to: number; readonly level: LevelOfChain };

const HARD_BREAK = 'hard_break';
const tokenLevels = new Map<string, LevelOfChain>();

/** an inline node's elements from its root down to its hole, as chain levels; null when it has no hole */
function nodeLevels(root: FaceElement): LevelOfChain[] | null {
	const levels: LevelOfChain[] = [];
	for (let el: FaceElement | null = root; el; el = el.hole ? null : el.firstElementChild) {
		const level = levelOfElement(el);
		levels.push({ key: `node:${JSON.stringify(level)}`, level });
		if (el.hole) return levels;
	}
	return null;
}

function tokenLevelOf(classes: string): LevelOfChain {
	let level = tokenLevels.get(classes);
	if (!level)
		tokenLevels.set(
			classes,
			(level = {
				key: `token:${classes}`,
				level: { tag: 'span', classes: classes.split(' '), attrs: {}, hovered: false, look: tokenLookOf(classes) }
			})
		);
	return level;
}

/** raw and code text colored by its grammar (14.2): each span's classes are the innermost level of its runs */
function tokenRunsOf(hole: FaceElement, node: PMNode, contentStart: number): readonly TokenRun[] {
	const spans = islandHighlighterOf(hole)?.spansOf(node.textContent) ?? [];
	return spans.map((span) => ({ from: contentStart + span.from, to: contentStart + span.to, level: tokenLevelOf(span.classes) }));
}

function holeOf(root: FaceElement): FaceElement | null {
	for (let el: FaceElement | null = root; el; el = el.firstElementChild) if (el.hole) return el;
	return null;
}

/** a face's own text or generated content: the style of the element that holds it, by its relative shift */
const runsOfStyles = new WeakMap<ComputedStyle, Map<number, RunStyle>>();
const stylesOfRuns = new WeakMap<RunStyle, ComputedStyle>();

/** the style a face text or generated run was made from, so a repaint can read it again */
export function styleOfRun(run: RunStyle): ComputedStyle | null {
	return stylesOfRuns.get(run) ?? null;
}

/** a face's own text: the element's style as a run, one per style and shift (preflight's sup is relative, top -0.5em) */
export function runStyleOf(style: ComputedStyle, shift = 0): RunStyle {
	let byShift = runsOfStyles.get(style);
	if (!byShift) runsOfStyles.set(style, (byShift = new Map()));
	const known = byShift.get(shift);
	if (known) return known;
	const run: RunStyle = shift ? { ...plainRunOf(style), shift } : plainRunOf(style);
	byShift.set(shift, run);
	stylesOfRuns.set(run, style);
	return run;
}

/** px down a relatively positioned element moves its text */
function relativeShiftOf(style: ComputedStyle): number {
	const { position, inset } = style.layout;
	if (position !== 'relative') return 0;
	if (inset.top !== 'auto') return inset.top.px;
	return inset.bottom !== 'auto' ? -inset.bottom.px : 0;
}

function plainRunOf(style: ComputedStyle): RunStyle {
	const { layout } = style;
	return {
		id: style.id,
		layoutKey: -style.layoutId,
		paintKey: -style.paintId,
		font: layout.font,
		fontString: canvasFontOf(layout.font),
		letterSpacing: layout.letterSpacing,
		wordSpacing: layout.wordSpacing,
		textTransform: layout.textTransform,
		verticalAlign: layout.verticalAlign,
		edges: { start: 0, end: 0 },
		paint: style.paint,
		lineHeight: layout.lineHeight
	};
}

/** the room a level's own inline start (or end) takes: from the difference of two prefix chains (02-c2.md) */
function openingEdge(source: TextblockSource, levels: readonly LevelOfChain[], shared: number, side: 'start' | 'end'): number {
	const whole = source.styles.runStyle(source.hole, chainOf(levels)).edges[side];
	if (whole === 0 || shared === levels.length) return 0;
	return whole - (shared ? source.styles.runStyle(source.hole, chainOf(levels.slice(0, shared))).edges[side] : 0);
}

function sharedLevels(one: readonly LevelOfChain[] | null, two: readonly LevelOfChain[] | null): number {
	if (!one || !two) return 0;
	let shared = 0;
	while (shared < one.length && shared < two.length && one[shared].key === two[shared].key) shared++;
	return shared;
}

function eventsOf(source: TextblockSource, contentStart: number, contentEnd: number): InlineEvent[] {
	const events: InlineEvent[] = [];
	const { styles, blockPos } = source;
	for (const [element, widget] of source.widgets) {
		if (element.parentNode !== source.hole || widget.pos < contentStart || widget.pos > contentEnd) continue;
		const style = styles.styleOf(element);
		if (!style || style.layout.display === 'none') continue;
		events.push({
			at: widget.pos,
			side: widget.side,
			pieces: () => [{ kind: 'object', at: widget.pos, size: 0, element, style, side: widget.side }]
		});
	}
	const frameWidgets = source.decorations.widgets;
	for (const words of struckWordsIn(frameWidgets, blockPos + contentStart, blockPos + contentEnd)) {
		const at = contentStart + words.at;
		if (words.lineEnd) {
			events.push({ at, side: words.side, pieces: () => [{ kind: 'break', at, size: 0 }] });
			continue;
		}
		events.push({ at, side: words.side, pieces: () => struckPieces(source, at, words.key, words.runs, words.tint) });
	}
	return events.sort((a, b) => a.at - b.at || a.side - b.side);
}

const struckLooks = new Map<string, StyleLook>();

/** old words struck through on the suggestion's tint, which no selection or copy takes */
function struckLook(tint: string): StyleLook {
	let look = struckLooks.get(tint);
	if (!look) struckLooks.set(tint, (look = { textDecoration: 'line-through', userSelect: 'none', backgroundColor: tint }));
	return look;
}

function struckPieces(
	source: TextblockSource,
	at: number,
	key: string,
	runs: readonly { text: string; marks: readonly Mark[] }[],
	tint: string
): InlinePiece[] {
	const look: LevelOfChain = {
		key: `struck ${tint}`,
		level: { tag: 'span', classes: ['pm-suggest-old'], attrs: {}, hovered: false, look: struckLook(tint) }
	};
	return runs.map((part) => {
		const run = source.styles.runStyle(source.hole, chainOf([look, ...part.marks.flatMap((mark) => source.marks.levelsOf(mark))]));
		return { kind: 'text', from: at, to: at, text: part.text, run, edgeStart: 0, edgeEnd: 0, struck: key };
	});
}

function decorationsIn(source: TextblockSource, contentStart: number, contentEnd: number): InlineDecorationView[] {
	const from = source.blockPos + contentStart;
	const to = source.blockPos + contentEnd;
	// a paint-only decoration (a comment, a peer's selection, a find) is drawn over the lines and never cuts a run
	return source.decorations.inline
		.filter((decoration) => decoration.from < to && decoration.to > from && decoration.from < decoration.to)
		.filter((decoration) => changesLayout(source.styles, decoration))
		.map((decoration) => ({ ...decoration, from: decoration.from - source.blockPos, to: decoration.to - source.blockPos }));
}

/** a face with a hole for the node's content; one without draws the node whole, as a node view without contentDOM */
function holdsContent(element: FaceElement): boolean {
	return element.hole || element.children.some(holdsContent);
}

/** the textblock's pieces; text runs carry their style and the edges of the mark levels opening and closing at them */
export function textblockContent(source: TextblockSource): InlinePiece[] {
	const { node, positions, styles } = source;
	const contentStart = source.offset + 1;
	const contentEnd = contentStart + node.content.size;
	const events = eventsOf(source, contentStart, contentEnd);
	// a decoration's wrapper stands in the hole for its node's own root
	const roots = new Map(source.hole.children.map((child) => [positions.posOf(child), child]));
	const decorations = decorationsIn(source, contentStart, contentEnd);
	let tokens = tokenRunsOf(source.hole, node, contentStart);
	const pieces: InlinePiece[] = [];
	const chains = new Map<InlineText, readonly LevelOfChain[]>();
	let nextEvent = 0;
	let nextToken = 0;

	function eventsUpTo(at: number): void {
		while (nextEvent < events.length && events[nextEvent].at <= at) pieces.push(...events[nextEvent++].pieces());
	}
	function tokenAt(from: number, to: number): LevelOfChain | null {
		while (nextToken < tokens.length && tokens[nextToken].to <= from) nextToken++;
		const token = tokens[nextToken];
		return token && token.from <= from && token.to >= to ? token.level : null;
	}
	function addText(text: string, from: number, outer: readonly LevelOfChain[]): void {
		const covering = decorations.filter((decoration) => decoration.from <= from && decoration.to >= from + text.length);
		const token = tokenAt(from, from + text.length);
		const levels = [...outer, ...[decorationLevel(covering), token].filter((level) => level !== null)];
		const run = styles.runStyle(source.hole, chainOf(levels));
		const piece: InlineText = { kind: 'text', from, to: from + text.length, text, run, edgeStart: 0, edgeEnd: 0, struck: null };
		chains.set(piece, levels);
		pieces.push(piece);
	}

	function addChild(child: PMNode, at: number, outer: readonly LevelOfChain[]): void {
		eventsUpTo(at);
		if (child.isText) {
			const end = at + child.nodeSize;
			const cuts = new Set<number>();
			for (const edged of [...decorations, ...tokens])
				for (const edge of [edged.from, edged.to]) if (edge > at && edge < end) cuts.add(edge);
			for (let i = nextEvent; i < events.length && events[i].at < end; i++) cuts.add(events[i].at);
			const levels = [...outer, ...child.marks.flatMap((mark) => source.marks.levelsOf(mark))];
			let start = at;
			for (const cut of [...[...cuts].sort((a, b) => a - b), end]) {
				eventsUpTo(start);
				if (cut > start) addText(child.text!.slice(start - at, cut - at), start, levels);
				start = cut;
			}
			return;
		}
		if (child.type.name === HARD_BREAK) {
			pieces.push({ kind: 'break', at, size: child.nodeSize });
			return;
		}
		const element = roots.get(at) ?? positions.elementAt(at);
		const style = element ? styles.styleOf(element) : null;
		if (!element || !style || style.layout.display === 'none') return;
		// an inline node whose face holds its content (an unported chip, as source): its text flows in the line
		const levels =
			!child.isAtom && style.layout.display === 'inline' && !element.replaced && holdsContent(element) ? nodeLevels(element) : null;
		const wrapping = levels && [...outer, ...child.marks.flatMap((mark) => source.marks.levelsOf(mark)), ...levels];
		if (!wrapping) {
			pieces.push({ kind: 'object', at, size: child.nodeSize, element, style, side: null });
			return;
		}
		// an inline island (a raw chip as source) colors its own text
		const hole = holeOf(element);
		const own = hole && islandHighlighterOf(hole) ? tokenRunsOf(hole, child, at + 1) : null;
		const around = { tokens, nextToken };
		if (own) [tokens, nextToken] = [own, 0];
		child.forEach((inner, innerOffset) => addChild(inner, at + 1 + innerOffset, wrapping));
		if (own) ({ tokens, nextToken } = around);
	}

	const before = source.generated('before');
	if (before) pieces.push(before);
	node.forEach((child, childOffset) => addChild(child, contentStart + childOffset, []));
	eventsUpTo(contentEnd);
	const after = source.generated('after');
	if (after) pieces.push(after);
	return withEdges(source, pieces, chains);
}

function withEdges(
	source: TextblockSource,
	pieces: InlinePiece[],
	chains: ReadonlyMap<InlineText, readonly LevelOfChain[]>
): InlinePiece[] {
	if (![...chains.keys()].some((piece) => piece.run.edges.start || piece.run.edges.end)) return pieces;
	return pieces.map((piece, i) => {
		const levels = piece.kind === 'text' ? chains.get(piece) : undefined;
		if (piece.kind !== 'text' || !levels || (!piece.run.edges.start && !piece.run.edges.end)) return piece;
		const previous = pieces[i - 1]?.kind === 'text' ? (chains.get(pieces[i - 1] as InlineText) ?? null) : null;
		const next = pieces[i + 1]?.kind === 'text' ? (chains.get(pieces[i + 1] as InlineText) ?? null) : null;
		return {
			...piece,
			edgeStart: openingEdge(source, levels, sharedLevels(previous, levels), 'start'),
			edgeEnd: openingEdge(source, levels, sharedLevels(levels, next), 'end')
		};
	});
}

/** a face's own inline content (a chip's label): its text in the style of the element holding it, inline elements flat */
/** a face inline element that draws a border (fbox, a glossary term): its text runs carry no border, so it lays out as its own box */
export function framesInline(style: ComputedStyle): boolean {
	const { borderWidth, borderStyle } = style.layout;
	const { borderColor } = style.paint;
	return (['top', 'right', 'bottom', 'left'] as const).some(
		(side) => borderWidth[side] > 0 && borderStyle[side] !== 'none' && borderColor[side].a > 0
	);
}

function inlineEdge({ layout }: ComputedStyle, side: 'left' | 'right'): number {
	const margin = layout.margin[side];
	return (margin === 'auto' ? 0 : margin.px) + layout.padding[side].px + layout.borderWidth[side];
}

export function faceContent(root: FaceElement, at: number, styleOf: (el: FaceElement) => ComputedStyle | null): InlinePiece[] {
	const pieces: InlinePiece[] = [];
	function visit(el: FaceElement, style: ComputedStyle, shift: number): void {
		const first = pieces.length;
		visitChildren(el, style, shift);
		const texts = pieces.flatMap((piece, i) => (i >= first && piece.kind === 'text' ? [i] : []));
		const start = inlineEdge(style, 'left');
		const end = inlineEdge(style, 'right');
		if (!texts.length || (!start && !end)) return;
		const head = pieces[texts[0]] as InlineText;
		pieces[texts[0]] = { ...head, edgeStart: head.edgeStart + start };
		const tail = pieces[texts.at(-1)!] as InlineText;
		pieces[texts.at(-1)!] = { ...tail, edgeEnd: tail.edgeEnd + end };
	}
	function visitChildren(el: FaceElement, style: ComputedStyle, shift: number): void {
		const run = runStyleOf(style, shift);
		for (const child of el.childNodes) {
			if (!(child instanceof FaceElement)) {
				if (child.textContent)
					pieces.push({ kind: 'text', from: at, to: at, text: child.textContent, run, edgeStart: 0, edgeEnd: 0, struck: null });
				continue;
			}
			const own = styleOf(child);
			if (!own || own.layout.display === 'none') continue;
			if (own.layout.display === 'inline' && !child.replaced && !framesInline(own)) visit(child, own, shift + relativeShiftOf(own));
			else pieces.push({ kind: 'object', at, size: 0, element: child, style: own, side: null });
		}
	}
	const style = styleOf(root);
	if (style) visit(root, style, relativeShiftOf(style));
	return pieces;
}
