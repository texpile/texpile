// math node views built as a block builds them, for the math view tests
import { Schema, type Node as PMNode, type NodeSpec } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { CanvasNodeView, ComputedStyle, FaceElement, FaceInputKey, VisualView } from '$lib/editor/canvas';
import { buildHelpersOf, PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import { mathNodeViews } from '$lib/editor/canvas/math/mathViews';
import { formulaElement } from '$lib/editor/canvas/math/mathReplaced';
import { FormulaLayoutCache } from '$lib/editor/canvas/math/mathLayoutCache';
import { recordingContext } from '../paint/recordingContext';

export const measure = (font: string, text: string) => 0.5 * Number(/(\d+)px/.exec(font)?.[1] ?? 16) * text.length;
export const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };

export function schemaFor(spec: Partial<NodeSpec>): Schema {
	return new Schema({
		nodes: {
			doc: { content: 'block+' },
			paragraph: { group: 'block', content: 'inline*' },
			inline_math: { group: 'inline', inline: true, atom: true, content: 'text*', ...spec },
			block_math: {
				group: 'block',
				atom: true,
				content: 'text*',
				attrs: { label: { default: null }, numbered: { default: false }, environment: { default: null }, lineLabels: { default: [] } },
				...spec
			},
			text: { group: 'inline' }
		}
	});
}

/** a view's build, as a block builds it: `counted` is what the equation counter reads at the node, itself included */
export function viewOf(
	node: PMNode,
	language: 'latex' | 'typst' | 'markdown',
	options: { numbers?: string[]; counted?: number; editable?: boolean; layouts?: FormulaLayoutCache } = {}
) {
	const keys: FaceInputKey[] = [];
	const tools = buildHelpersOf({
		view: {} as VisualView,
		language,
		editable: true,
		settings: SETTINGS,
		schema: node.type.schema,
		counters: { at: () => options.counted ?? 0 },
		media: { ...PLAIN_FACE_MEDIA, math: (source) => formulaElement(source, options.layouts ?? TEST_LAYOUTS, NO_STRUT) },
		record: (key) => keys.push(key)
	});
	const view = { editable: options.editable ?? true, isDestroyed: false, canvas: { build: tools } } as unknown as VisualView;
	const numbered = (numbers?: string[]) => (numbers ? [Decoration.node(0, node.nodeSize, {}, { numbers })] : []);
	const spec: CanvasNodeView = inBuild(tools, () =>
		mathNodeViews(language)[node.type.name](node, view, () => 0, numbered(options.numbers), DecorationSet.empty)
	);
	return {
		el: spec.dom,
		keys,
		spec,
		update: (next: PMNode, numbers?: string[]) => inBuild(tools, () => spec.update!(next, numbered(numbers), DecorationSet.empty))
	};
}

export const formulaIn = (el: FaceElement) => el.querySelector('.math-formula')!;
export const NUMBER_TEXT = /^(paint\.color|layout\.font\.(sizePx|weight|families|style))\b/;
// the formulas of the views, laid out with the half-em measure
export const TEST_LAYOUTS = new FormulaLayoutCache(measure);
export const NO_STRUT = () => ({ ascent: 0, descent: 0 });

/** the numbers a per-row display paints, with the y of each, after its formula is laid out at 16 px */
export function paintedNumbers(el: FaceElement): { text: string; y: number }[] {
	formulaIn(el).replaced!.intrinsic(style(16));
	const numbers = el.querySelector('.equation-numbers');
	if (!numbers) return [];
	const size = numbers.replaced!.intrinsic(style(16))!;
	const { context, draws } = recordingContext();
	numbers.replaced!.paint(context, { x: 0, y: 0, width: size.width, height: size.height }, { color: BLACK } as never, () => BLACK);
	return draws.filter((draw) => draw.call === 'fillText').map((draw) => ({ text: String(draw.args[0]), y: Number(draw.args[2]) }));
}
export const BLACK = { r: 0, g: 0, b: 0, a: 1 };
export const style = (sizePx: number) => ({ layout: { font: { sizePx, families: 'serif' } }, paint: {} }) as unknown as ComputedStyle;
