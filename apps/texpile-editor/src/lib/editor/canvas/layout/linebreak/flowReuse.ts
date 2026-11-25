// a key in one paragraph of an environment breaks that paragraph alone (0.5): the others keep their lines by node
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, LayoutBox, LineBox, LineFragment } from '../../contracts/layoutTypes';
import type { ComputedStyle, CanvasStyles } from '../../contracts/styleTypes';
import type { FaceElement } from '../../tree/faceElement';
import type { InlinePiece } from '../inline/inlineContent';

/** what a flow's lines were made from besides its node; offsets in the pieces are from the block's start then */
export type FlowInputs = {
	readonly width: number;
	readonly style: ComputedStyle;
	/** justify, the hyphenation patterns and the pixel ratio */
	readonly breaking: unknown;
	readonly pieces: readonly InlinePiece[];
};

export type FlowLines = {
	readonly lines: LineBox[];
	readonly baselines: { first: number; last: number } | null;
	readonly contentHeight: number;
};

/** replaced content inside an object: its size can arrive without its element changing */
type ReplacedSize = { readonly element: FaceElement; readonly width: number; readonly height: number; readonly baseline?: number };

type KeptFlow = FlowInputs & FlowLines & { readonly offset: number; readonly replaced: readonly ReplacedSize[] };

/** the flows one layout made or reused, by the node each belongs to */
export type FlowMemory = Map<PMNode, KeptFlow>;

const memories = new WeakMap<BlockLayout, FlowMemory>();

export function flowsOf(layout: BlockLayout | null | undefined): FlowMemory | null {
	return (layout && memories.get(layout)) ?? null;
}

/** a block of one flow (a top-level paragraph) changes with its only node, so nothing of it is kept */
export function keepFlows(layout: BlockLayout, memory: FlowMemory): void {
	if (memory.size > 1) memories.set(layout, memory);
}

function samePiece(a: InlinePiece, b: InlinePiece, delta: number): boolean {
	switch (a.kind) {
		case 'text':
			return (
				b.kind === 'text' &&
				a.text === b.text &&
				a.run.id === b.run.id &&
				a.from === b.from + delta &&
				a.to === b.to + delta &&
				a.edgeStart === b.edgeStart &&
				a.edgeEnd === b.edgeEnd &&
				a.struck === b.struck
			);
		case 'object':
			return (
				b.kind === 'object' &&
				a.element === b.element &&
				a.style.id === b.style.id &&
				a.at === b.at + delta &&
				a.size === b.size &&
				a.side === b.side
			);
		case 'break':
			return b.kind === 'break' && a.at === b.at + delta && a.size === b.size;
		case 'generated':
			return b.kind === 'generated' && a.text === b.text && a.style.id === b.style.id && a.at === b.at + delta && a.edges === b.edges;
	}
}

function replacedIn(pieces: readonly InlinePiece[], styles: CanvasStyles): ReplacedSize[] {
	const sizes: ReplacedSize[] = [];
	function visit(element: FaceElement): void {
		if (element.replaced) {
			const style = styles.styleOf(element);
			const size = style && element.replaced.intrinsic(style);
			sizes.push({ element, width: size?.width ?? NaN, height: size?.height ?? NaN, baseline: size?.baseline });
		}
		for (const child of element.children) visit(child);
	}
	for (const piece of pieces) if (piece.kind === 'object') visit(piece.element);
	return sizes;
}

function sameReplaced(sizes: readonly ReplacedSize[], styles: CanvasStyles): boolean {
	return sizes.every(({ element, width, height, baseline }) => {
		const style = styles.styleOf(element);
		const size = style && element.replaced?.intrinsic(style);
		return !!size && size.width === width && size.height === height && size.baseline === baseline;
	});
}

function movedBox(box: LayoutBox, delta: number): LayoutBox {
	return {
		...box,
		node: box.node && { node: box.node.node, offset: box.node.offset + delta },
		lines: box.lines && movedLines(box.lines, delta),
		children: box.children.map((child) => movedBox(child, delta))
	};
}

function movedFragment(fragment: LineFragment, delta: number): LineFragment {
	switch (fragment.kind) {
		case 'text':
			return { ...fragment, from: fragment.from + delta, to: fragment.to + delta };
		case 'atomic':
			return { ...fragment, from: fragment.from + delta, to: fragment.to + delta, box: movedBox(fragment.box, delta) };
		case 'hyphen':
			return { ...fragment, at: fragment.at + delta };
		case 'widget':
			return { ...fragment, at: fragment.at + delta, box: fragment.box && movedBox(fragment.box, delta) };
		default:
			return fragment;
	}
}

function movedLines(lines: readonly LineBox[], delta: number): LineBox[] {
	return lines.map((line) => ({
		...line,
		from: line.from + delta,
		to: line.to + delta,
		fragments: line.fragments.map((fragment) => movedFragment(fragment, delta)),
		hyphen: line.hyphen && movedFragment(line.hyphen, delta)
	}));
}

/** the lines kept for node when everything they were made from is the same, moved to where the node is now */
export function reuseFlow(kept: KeptFlow | undefined, inputs: FlowInputs, offset: number, styles: CanvasStyles): FlowLines | null {
	if (!kept || kept.width !== inputs.width || kept.style.id !== inputs.style.id || kept.breaking !== inputs.breaking) return null;
	const delta = offset - kept.offset;
	const { pieces } = inputs;
	if (pieces.length !== kept.pieces.length || !pieces.every((piece, i) => samePiece(piece, kept.pieces[i], delta))) return null;
	if (!sameReplaced(kept.replaced, styles)) return null;
	if (!delta) return { lines: kept.lines, baselines: kept.baselines, contentHeight: kept.contentHeight };
	return { lines: movedLines(kept.lines, delta), baselines: kept.baselines, contentHeight: kept.contentHeight };
}

export function rememberFlow(
	memory: FlowMemory,
	node: PMNode,
	offset: number,
	inputs: FlowInputs,
	made: FlowLines,
	styles: CanvasStyles
): void {
	memory.set(node, { ...inputs, ...made, offset, replaced: replacedIn(inputs.pieces, styles) });
}
