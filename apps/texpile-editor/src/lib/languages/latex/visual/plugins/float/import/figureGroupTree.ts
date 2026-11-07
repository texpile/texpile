import {
	FIG_CAP_SLOT,
	FIG_LAB_SLOT,
	argText,
	argTextContent,
	hasStar,
	imageOf,
	mandatoryArgs,
	optionalArg,
	type ConversionContext,
	type ImportCall,
	type PmNode,
	type TreeEnvironment,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';
import { figurePanelsOf } from './figurePanels';
import { captionArgOf } from './captionParts';

type Span = { from: number; to: number };
type PanelSlot = 'Image' | 'Caption' | 'Label';

export function panelSlot(kind: PanelSlot, i: number): string {
	return `\\TexpilePanel${kind}Slot{${i}}`;
}

export const PANEL_SLOTS = /\\TexpilePanel(Image|Caption|Label)Slot\{(\d+)\}/g;

export function panelBox(i: number): [string, string] {
	return [`\\TexpilePanelOpen{${i}}`, `\\TexpilePanelClose{${i}}`];
}

function inside(outer: Span | null | undefined, at: number): boolean {
	return !!outer && at >= outer.from && at < outer.to;
}

function labelText(im: TreeImport, call: ImportCall): string | null {
	return argTextContent(im, mandatoryArgs(call)[0]) || null;
}

function templateOf(im: TreeImport, env: TreeEnvironment, slots: [Span, string][]): string {
	let out = '';
	let at = env.from;
	for (const [span, slot] of [...slots].sort((a, b) => a[0].from - b[0].from)) {
		if (span.from < at) continue;
		out += im.src.slice(at, span.from) + slot;
		at = span.to;
	}
	return out + im.src.slice(at, env.to);
}

export function figureGroupBlocks(im: TreeImport, env: TreeEnvironment, ctx: ConversionContext, graphics: ImportCall[]): PmNode[] | null {
	const read = figurePanelsOf(im, env, graphics);
	if (!read || read.panels.length < 2 || read.captions.length > 1) return null;
	const slots: [Span, string][] = [];
	const images: PmNode[] = [];
	for (const [i, panel] of read.panels.entries()) {
		const image = imageOf(im, panel.graphic)?.[0];
		if (!image) return null;
		const words = panel.caption?.body;
		const [open, close] = panelBox(i);
		slots.push([{ from: panel.box.from, to: panel.box.from }, open]);
		slots.push([panel.graphic, panelSlot('Image', i)]);
		if (words) slots.push([words, panelSlot('Caption', i)]);
		const label = panel.label && !inside(words, panel.label.from) ? panel.label : null;
		if (label) slots.push([label, panelSlot('Label', i)]);
		slots.push([{ from: panel.box.to, to: panel.box.to }, close]);
		const caption = words ? im.core.inline(words, ctx) : [];
		images.push(
			im.core.node(
				'image',
				{ ...image.attrs, label: label ? labelText(im, label) : null, numbered: false, showCaption: !!words, bareOriginal: false },
				caption.length ? caption : null
			)
		);
	}
	const caption = read.captions[0];
	const words = caption ? captionArgOf(im, caption) : null;
	const short = caption ? optionalArg(caption) : undefined;
	if (caption) slots.push([caption, FIG_CAP_SLOT]);
	const label = read.labels.find((l) => !inside(caption, l.from)) ?? null;
	if (label) slots.push([label, FIG_LAB_SLOT]);
	const captionNode = im.core.node(
		'figure_caption',
		{ starred: !!caption && hasStar(caption), captionOpt: short && short !== words ? argText(im.src, short) : null },
		words?.body ? im.core.inline(words.body, ctx) : null
	);
	return [
		im.core.node('figure_group', { figureTemplate: templateOf(im, env, slots), label: label ? labelText(im, label) : null }, [
			...images,
			captionNode
		])
	];
}
