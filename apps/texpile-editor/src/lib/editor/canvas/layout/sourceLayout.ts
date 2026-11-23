// D33: a block whose face, style or layout threw is drawn as its text in the plain island look: the document font,
// pre-wrap, greedy lines, and in dev builds a dashed error frame
import type { BlockLayout, LayoutBoxBuilder, PositionMap } from '../contracts/layoutTypes';
import type { ComputedStyle, LayoutStyle } from '../contracts/styleTypes';
import type { BlockLayoutRequest } from '../contracts/engineTypes';
import { initialStyle } from '../style/resolve/internStyle';
import { faceElement } from '../tree/faceElement';
import { runStyleOf, type InlinePiece } from './inline/inlineContent';
import { layoutInlineFlow } from './inline/inlineFlow';
import type { LayoutTools } from './layoutElement';

const NO_POSITIONS: PositionMap = { posOf: () => null, elementAt: () => null, contentStart: () => null };
const plainElement = faceElement('div');

/** the editor root's text style as a plain div inherits it; styles answering nothing give CSS's initial values */
function plainStyle(request: BlockLayoutRequest, dev: boolean): ComputedStyle {
	let base: ComputedStyle | null;
	try {
		base = request.styles.styleOf(plainElement);
	} catch {
		base = null;
	}
	base ??= initialStyle();
	const frame = dev ? 1 : 0;
	const layout: LayoutStyle = {
		...base.layout,
		display: 'block',
		whiteSpace: 'pre-wrap',
		textAlign: 'start',
		textIndent: { px: 0, percent: 0 },
		borderWidth: { top: frame, right: frame, bottom: frame, left: frame },
		borderStyle: { top: 'dashed', right: 'dashed', bottom: 'dashed', left: 'dashed' }
	};
	const error = dev ? request.styles.token('--color-error-500') : base.paint.color;
	const paint = {
		...base.paint,
		backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
		borderColor: { top: error, right: error, bottom: error, left: error }
	};
	return { ...base, layout, paint };
}

/** the block's text nodes as runs, each textblock on its own lines */
function sourcePieces(request: BlockLayoutRequest, style: ComputedStyle): InlinePiece[] {
	const run = runStyleOf(style);
	const pieces: InlinePiece[] = [];
	request.node.descendants((node, offset) => {
		const at = offset + 1;
		if (node.isTextblock && pieces.length) pieces.push({ kind: 'break', at, size: 0 });
		if (node.isText)
			pieces.push({ kind: 'text', from: at, to: at + node.nodeSize, text: node.text!, run, edgeStart: 0, edgeEnd: 0, struck: null });
		return true;
	});
	return pieces;
}

export function layoutSource(
	request: BlockLayoutRequest,
	error: Error,
	tools: LayoutTools,
	dev = import.meta.env?.DEV ?? false
): BlockLayout {
	const style = plainStyle(request, dev);
	const frame = style.layout.borderWidth.top;
	const draft: LayoutBoxBuilder = {
		element: request.root ?? null,
		pseudo: null,
		style,
		x: 0,
		y: 0,
		width: request.width,
		height: 0,
		margin: { top: 0, right: 0, bottom: 0, left: 0 },
		kind: 'block',
		children: [],
		lines: null,
		node: { node: request.node, offset: 0 },
		baselines: null,
		scroll: null,
		clip: false
	};
	const flow = {
		measure: tools.measure,
		metrics: tools.metrics,
		justify: false,
		hyphenator: null,
		kept: null,
		blockPos: request.pos,
		pixelRatio: request.pixelRatio,
		layoutObject: () => {
			throw new Error('a source block holds no objects');
		}
	};
	const contentHeight = layoutInlineFlow(
		draft,
		{ node: null, offset: 0, pieces: sourcePieces(request, style) },
		flow,
		Math.max(0, request.width - 2 * frame)
	);
	draft.height = contentHeight + 2 * frame;
	return {
		box: draft,
		height: draft.height,
		outerMargin: { top: 0, bottom: 0 },
		positions: request.positions ?? NO_POSITIONS,
		keys: [],
		error
	};
}
