// a document model over the test doubles: each top-level block laid out from its toDOM, stacked with collapsed margins
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { DecorationSource } from 'prosemirror-view';
import type { BlockLayout, CanvasGeometry, CanvasStyles, FaceElement, FrameDecorations, VisualView } from '$lib/editor/canvas';
import type { DocumentModel } from '$lib/editor/canvas/contracts/engineTypes';
import { createCanvasGeometry } from '$lib/editor/canvas/geometry/canvasGeometry';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { fixedStyles, type FixedStyleRule } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testBlockElements, testMetrics } from '../layout/layoutFixture';

export type TestModelOptions = {
	width?: number;
	rules?: readonly FixedStyleRule[];
	/** styles in place of the fixed ones */
	styles?: CanvasStyles;
	/** changes a block's elements before it is laid out (an anchor, a hint) */
	prepare?: (root: FaceElement, node: PMNode) => void;
	decorations?: DecorationSource;
	/** the decorations the blocks are laid out under */
	frameDecorations?: FrameDecorations;
	editable?: boolean;
};

export type TestModel = { model: DocumentModel; geometry: CanvasGeometry; view: VisualView; layouts: BlockLayout[] };

export const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };

export function testModel(doc: PMNode, options: TestModelOptions = {}): TestModel {
	const width = options.width ?? 300;
	const styles = options.styles ?? fixedStyles(options.rules ?? []);
	const view = {
		state: EditorState.create({ doc }),
		editable: options.editable ?? true,
		props: { language: 'latex' },
		someProp(name: string, f?: (value: unknown) => unknown) {
			if (name !== 'decorations' || !options.decorations || !f) return undefined;
			return f(() => options.decorations);
		}
	} as unknown as VisualView;
	const blocks: { node: PMNode; pos: number }[] = [];
	doc.forEach((node, offset) => blocks.push({ node, pos: offset }));
	const built = blocks.map(({ node }) => {
		const elements = testBlockElements(node);
		options.prepare?.(elements.root, node);
		return elements;
	});
	const layouts = blocks.map(({ node, pos }, index) => {
		const { root, positions } = built[index];
		return layoutBlock(
			{
				node,
				pos,
				root,
				positions,
				widgets: new Map(),
				width,
				styles,
				decorations: options.frameDecorations ?? { inline: [], nodes: new Map(), widgets: [] },
				breaking: new ViewLineBreaking(() => 'none'),
				settings: SETTINGS,
				pixelRatio: 1
			},
			{ measure: monoMeasure, metrics: testMetrics }
		);
	});
	const tops: number[] = [];
	let y = 0;
	let margin = 0;
	layouts.forEach((layout) => {
		y += Math.max(margin, layout.outerMargin.top);
		tops.push(y);
		y += layout.height;
		margin = layout.outerMargin.bottom;
	});
	const model: DocumentModel = {
		view,
		width,
		count: blocks.length,
		block: (index) => blocks[index],
		indexAt(pos) {
			const index = blocks.findIndex((block) => pos < block.pos + block.node.nodeSize);
			return index < 0 ? blocks.length - 1 : index;
		},
		indexAtY(at) {
			let index = 0;
			tops.forEach((top, i) => {
				if (top <= at) index = i;
			});
			return index;
		},
		top: (index) => ({ y: tops[index], estimated: false }),
		height: y + margin,
		layout: (index) => layouts[index],
		cached: (index) => layouts[index],
		lastLayout: (index) => layouts[index],
		elements: (index) => built[index].root
	};
	return { model, view, layouts, geometry: createCanvasGeometry(model, { measure: monoMeasure, metrics: testMetrics }) };
}

/** a document position's doc point on its caret line, the middle of the line's text */
export function pointAt(geometry: CanvasGeometry, pos: number, dx = 0): { x: number; y: number } {
	const rect = geometry.caretRect({ pos, affinity: 1 })!;
	return { x: rect.x + dx, y: rect.y + rect.height / 2 };
}
