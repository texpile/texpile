// a CanvasView in jsdom (18.1): fixed styles, the fixed-advance measurer, one line per block and a recording painter
import { Schema, type Node as PMNode } from 'prosemirror-model';
import type { EditorState, Plugin } from 'prosemirror-state';
import {
	createCanvasView,
	type BlockLayout,
	type BlockLayoutRequest,
	type CanvasEngine,
	type CanvasGeometry,
	type CanvasPainter,
	type CanvasProbe,
	type CanvasProps,
	type CanvasView,
	type DocumentModel,
	type FaceInputKey,
	type CanvasNodeViews,
	type FaceSettings,
	type LineGeometry,
	type ViewStyles
} from '$lib/editor/canvas';
import { DrawListRecorder } from '$lib/editor/canvas/probe/drawListRecorder';
import { defaultLayoutStyle, defaultPaintStyle, fixedViewStyles, type FixedStyleRule } from './fixedStyles';
import { monoMeasure } from './monoMeasure';

export type TestCanvasViewOptions = {
	/** the column width, CSS px */
	width?: number;
	/** the pane's height, CSS px */
	height?: number;
	nodeViews?: CanvasNodeViews;
	plugins?: Plugin[];
	rules?: FixedStyleRule[];
	props?: Partial<CanvasProps>;
	engine?: Partial<CanvasEngine>;
	onReady?: () => void;
	/** a block's laid-out height, LINE when it gives none */
	blockHeight?: (node: PMNode) => number | null;
	/** the pane and file probe.views() names the view by */
	probe?: { pane: string; path: string };
	/** the inputs a block's layout reads, so firing one relays it */
	blockKeys?: (node: PMNode) => readonly FaceInputKey[];
};

export const TEST_FACE_SETTINGS: FaceSettings = {
	justify: false,
	hyphenate: false,
	showCaptions: true,
	imageDirectory: '',
	cropFormat: 'latex',
	isMainFile: true
};

export const LINE = 24;
/** the column's left edge in the pane, like VisualEditorHost's gutters */
export const GUTTER = 48;
/** one x step per position in the test geometry */
const ADVANCE = 8;

/** paragraphs, a heading, a quote holding blocks, an inline atom and three marks: enough for the view's own tests */
export const testSchema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
		heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } }, toDOM: (node) => [`h${node.attrs.level}`, 0] },
		blockquote: { group: 'block', content: 'block+', toDOM: () => ['blockquote', 0] },
		image: {
			group: 'block',
			attrs: { label: { default: '' }, numbered: { default: true } },
			toDOM: (node) => ['div', { class: 'imagePluginRoot', 'imageplugin-label': node.attrs.label }]
		},
		cite: {
			group: 'inline',
			inline: true,
			atom: true,
			attrs: { key: { default: '' } },
			toDOM: (node) => ['span', { class: 'cite', 'data-key': node.attrs.key }, `[${node.attrs.key}]`]
		},
		text: { group: 'inline' }
	},
	marks: {
		link: { attrs: { href: {} }, toDOM: (mark) => ['a', { href: mark.attrs.href }, 0] },
		strong: { toDOM: () => ['strong', 0] },
		em: { toDOM: () => ['em', 0] }
	}
});

/** fixed styles whose epochs a test moves itself */
export function testStyles(rules?: FixedStyleRule[]): ViewStyles & { epoch: number } {
	const styles = fixedViewStyles(rules);
	let epoch = 0;
	return Object.defineProperty(styles, 'epoch', { get: () => epoch, set: (value: number) => (epoch = value) }) as ViewStyles & {
		epoch: number;
	};
}

/** the test engine's layout: the block as one box of this height */
export function lineLayout(
	request: BlockLayoutRequest,
	height: number,
	error: Error | null,
	keys: readonly FaceInputKey[] = []
): BlockLayout {
	const style = { id: 0, layoutId: 0, paintId: 0, layout: defaultLayoutStyle(), paint: defaultPaintStyle() };
	const zero = { top: 0, right: 0, bottom: 0, left: 0 };
	return {
		box: {
			element: request.root,
			pseudo: null,
			style,
			x: 0,
			y: 0,
			width: request.width,
			height,
			margin: zero,
			kind: 'block',
			children: [],
			lines: null,
			node: { node: request.node, offset: 0 },
			baselines: null,
			scroll: null,
			clip: false
		},
		height,
		outerMargin: { top: 0, bottom: 0 },
		positions: request.positions,
		keys,
		error
	};
}

/** one line per block, the caret one ADVANCE per position along it, until C2's canvasGeometry answers from the layout */
function lineGeometry(model: DocumentModel): CanvasGeometry {
	function line(index: number): LineGeometry {
		const { pos, node } = model.block(index);
		const top = model.top(index).y;
		const bottom = top + model.layout(index).height;
		const ref = { textblock: pos, index: 0 };
		const right = node.content.size * ADVANCE;
		return {
			ref,
			from: pos + 1,
			to: pos + node.nodeSize - 1,
			top,
			bottom,
			baseline: top + 18,
			textTop: top,
			textBottom: bottom,
			left: 0,
			right,
			hyphen: null,
			endExtension: 0
		};
	}
	function caretRect(pos: number): { x: number; y: number; width: number; height: number } {
		const index = model.indexAt(pos);
		const { y, bottom } = { y: line(index).top, bottom: line(index).bottom };
		return { x: (pos - model.block(index).pos - 1) * ADVANCE, y, width: 1, height: bottom - y };
	}
	return {
		hit(p) {
			if (!model.count) return null;
			const index = model.indexAtY(p.y);
			const { pos, node } = model.block(index);
			const at = Math.min(pos + node.nodeSize - 1, pos + 1 + Math.max(0, Math.round(p.x / ADVANCE)));
			const caret = { pos: at, affinity: 1 as const };
			return {
				pos: at,
				inside: -1,
				caret,
				target: { kind: 'text', textblock: pos },
				chain: [],
				cursor: 'text',
				marks: [],
				decorations: [],
				hint: null
			};
		},
		caretRect: (place) => (model.count ? caretRect(place.pos) : null),
		charRects: () => [],
		rangeRects: () => [],
		nodeRect(pos) {
			const index = model.indexAt(pos);
			if (model.block(index)?.pos !== pos) return null;
			const { y, estimated } = model.top(index);
			return { rect: { x: 0, y, width: model.width, height: model.layout(index).height }, estimated };
		},
		partRect: () => null,
		rangeTop: (pos) => model.top(model.indexAt(pos)),
		lineOf: (place) => (model.count ? line(model.indexAt(place.pos)) : null),
		linesOf: (textblock) => [line(model.indexAt(textblock))],
		adjacentLine: () => null,
		placeOnLine: (ref) => ({ pos: ref.textblock + 1, affinity: 1 }),
		placeAt: () => null,
		stopsOf: (textblock) => ({ textblock, positions: [] }),
		wordBoundary: (place) => place.pos,
		wordRange: (place) => ({ from: place.pos, to: place.pos }),
		directionAt: () => 'ltr',
		baseDirectionAt: () => 'ltr',
		visualStep: () => null,
		visualWordStart: () => null,
		endOfTextblock: () => true,
		scrollBoxAt: () => null,
		scrollBoxOf: () => null
	};
}

/** a block's box and its text, so a frame's draw list says what was painted where */
const recordingPainter: CanvasPainter = {
	opaque: true,
	ground(ctx, frame) {
		const { x, y, width, height } = frame.viewport;
		ctx.fillRect(x, y, width, height);
	},
	paintBlock(ctx, block) {
		ctx.fillRect(0, 0, block.layout.box.width, block.layout.height);
		ctx.fillText(block.layout.box.node?.node.textContent ?? '', 0, 18);
	},
	paintCarets() {},
	carets: () => [],
	destroy() {}
};

/** jsdom has no canvas: every context records */
function recordCanvases(): void {
	HTMLCanvasElement.prototype.getContext = function getContext() {
		return new DrawListRecorder(monoMeasure).context;
	} as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

/** a scrolling pane with the column inside its gutters, sized as jsdom cannot */
function testPane(width: number, height: number): HTMLElement {
	const pane = document.createElement('div');
	pane.style.overflowY = 'auto';
	Object.defineProperty(pane, 'clientWidth', { value: width + 2 * GUTTER });
	Object.defineProperty(pane, 'clientHeight', { value: height });
	pane.getBoundingClientRect = () => new DOMRect(0, 0, width + 2 * GUTTER, height);
	document.body.appendChild(pane);
	return pane;
}

const columns = new WeakMap<CanvasView, { width: number }>();

/** the column after a pane resize or a split divider drag */
export function setTestColumnWidth(view: CanvasView, width: number): void {
	columns.get(view)!.width = width;
}

/** after a painted frame with nothing pending */
export function settleTestView(view: CanvasView): Promise<void> {
	return view.canvas.probe!.settle();
}

export function createTestCanvasView(state: EditorState, options: TestCanvasViewOptions = {}): CanvasView {
	recordCanvases();
	const column = { width: options.width ?? 600 };
	const pane = testPane(column.width, options.height ?? 400);
	const place = pane.appendChild(document.createElement('div'));
	const height = (node: PMNode): number => options.blockHeight?.(node) ?? LINE;
	const engine: CanvasEngine = {
		measure: monoMeasure,
		createStyles: () => testStyles(options.rules),
		layoutBlock: (request) => lineLayout(request, height(request.node), null, options.blockKeys?.(request.node)),
		layoutSource: (request, error) => lineLayout(request, LINE, error),
		createGeometry: lineGeometry,
		createBreaking: () => ({ update: () => [] }),
		createPainter: () => recordingPainter,
		loadFonts: () => Promise.resolve(),
		...options.engine
	};
	const props: CanvasProps = { state, plugins: options.plugins, language: 'latex', nodeViews: options.nodeViews, ...options.props };
	const named = options.probe;
	const view = createCanvasView(place, props, {
		engine,
		settings: () => TEST_FACE_SETTINGS,
		onReady: options.onReady,
		probe: named && { pane: () => named.pane, path: () => named.path }
	});
	columns.set(view, column);
	view.dom.getBoundingClientRect = () => new DOMRect(GUTTER, -pane.scrollTop, column.width, parseFloat(view.dom.style.height) || 0);
	return view;
}

/** the probe of the view mounted last in this window */
export function testProbe(): NonNullable<ReturnType<CanvasProbe['active']>> {
	const probe = (window as Window & { __canvasProbe?: CanvasProbe }).__canvasProbe?.active();
	if (!probe) throw new Error('no canvas view is mounted');
	return probe;
}
