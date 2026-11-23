// a top-level block's element tree from its nodes' toDOM and the request layoutBlock takes, over the test doubles
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, CanvasStyles, FaceElement, FrameDecorations, PositionMap, TextMeasure } from '$lib/editor/canvas';
import { FaceText, renderFaceSpec } from '$lib/editor/canvas';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import type { FontMetricsReader } from '$lib/editor/canvas/layout/text/fontMetrics';
import { fixedStyles, type FixedStyleRule } from '../testing/fixedStyles';
import { monoMeasure, fontSizeOf } from '../testing/monoMeasure';

export const TEST_ASCENT = 0.75;
export const TEST_DESCENT = 0.25;

/** ascent and descent as fixed shares of the font size, whole pixels as Chromium reports them */
export const testMetrics: FontMetricsReader = (font) => {
	const size = fontSizeOf(font);
	return { ascent: Math.round(size * TEST_ASCENT), descent: Math.round(size * TEST_DESCENT), underlineOffset: 1, underlineThickness: 1 };
};

class TestPositions implements PositionMap {
	readonly offsets = new Map<FaceElement, number>();
	readonly starts = new Map<number, FaceElement>();
	readonly holes = new Map<FaceElement, number>();

	posOf(element: FaceElement): number | null {
		return this.offsets.get(element) ?? null;
	}
	elementAt(offset: number): FaceElement | null {
		return this.starts.get(offset) ?? null;
	}
	contentStart(element: FaceElement): number | null {
		return this.holes.get(element) ?? null;
	}
}

export type KeptElement = { dom: FaceElement; contentDOM: FaceElement | null | undefined };

/** the node's elements as toDOM builds them, text left out of the holes as nodeElements.ts leaves it; `kept` hands an
 * unchanged node its element again, as the view's descs do */
export function testBlockElements(top: PMNode, kept?: Map<PMNode, KeptElement>): { root: FaceElement; positions: PositionMap } {
	const positions = new TestPositions();
	function build(node: PMNode, offset: number): FaceElement {
		const known = kept?.get(node);
		if (known) {
			positions.offsets.set(known.dom, offset);
			positions.starts.set(offset, known.dom);
			if (known.contentDOM) positions.holes.set(known.contentDOM, offset + 1);
			node.forEach((child, childOffset) => {
				if (!child.isText) build(child, offset + 1 + childOffset);
			});
			return known.dom;
		}
		const { dom, contentDOM } = renderFaceSpec(node.type.spec.toDOM!(node));
		kept?.set(node, { dom, contentDOM });
		positions.offsets.set(dom, offset);
		positions.starts.set(offset, dom);
		if (!contentDOM) return dom;
		positions.holes.set(contentDOM, offset + 1);
		if (node.inlineContent && node.content.size) contentDOM.appendChild(new FaceText('​'));
		node.forEach((child, childOffset) => {
			if (!child.isText) contentDOM.appendChild(build(child, offset + 1 + childOffset));
		});
		return dom;
	}
	return { root: build(top, 0), positions };
}

export type TestLayoutOptions = {
	width?: number;
	rules?: readonly FixedStyleRule[];
	root?: FaceElement;
	/** the Justify setting, on by default */
	justify?: boolean;
	/** the view's line breaking; a fresh one hyphenates nothing until its patterns load */
	breaking?: ViewLineBreaking;
	pixelRatio?: number;
	/** the block's elements, when the test keeps those of unchanged nodes between layouts */
	elements?: { root: FaceElement; positions: PositionMap };
	previous?: BlockLayout | null;
	decorations?: FrameDecorations;
	measure?: TextMeasure;
	/** the resolver, when the test keeps one between layouts as the view does */
	styles?: CanvasStyles;
};

export function layoutTestBlock(top: PMNode, options: TestLayoutOptions = {}): BlockLayout {
	const { root, positions } =
		options.elements ?? (options.root ? { root: options.root, positions: new TestPositions() } : testBlockElements(top));
	const settings = {
		justify: options.justify ?? true,
		hyphenate: false,
		showCaptions: true,
		imageDirectory: '',
		cropFormat: '',
		isMainFile: true
	};
	return layoutBlock(
		{
			node: top,
			pos: 0,
			root,
			positions,
			widgets: new Map(),
			width: options.width ?? 600,
			styles: options.styles ?? fixedStyles(options.rules ?? []),
			decorations: options.decorations ?? { inline: [], nodes: new Map(), widgets: [] },
			breaking: options.breaking ?? new ViewLineBreaking(() => 'none'),
			settings,
			pixelRatio: options.pixelRatio ?? 1,
			previous: options.previous
		},
		{ measure: options.measure ?? monoMeasure, metrics: testMetrics }
	);
}

export function lineTexts(layout: BlockLayout): string[] {
	return (layout.box.lines ?? []).map((line) =>
		line.fragments.map((fragment) => (fragment.kind === 'text' ? fragment.text : fragment.kind === 'atomic' ? '[]' : '')).join('')
	);
}
