import {
	FIG_CAP_SLOT,
	FIG_IMG_SLOT,
	FIG_LAB_SLOT,
	PieceCursor,
	argText,
	argTextContent,
	bodyOf,
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
import type { SyntaxNode } from '@lezer/common';
import { figureGroupBlocks } from './figureGroupTree';
import { otherFloatBlocks } from './floatTree';

function callsNamed(im: TreeImport, env: SyntaxNode, name: string): ImportCall[] {
	const out: ImportCall[] = [];
	const word = `\\${name}`;
	for (let node: SyntaxNode | null = env.firstChild; node;) {
		if (node.name === 'ControlWord' && im.src.slice(node.from, node.to) === word && node.parent) {
			const cursor = new PieceCursor(im.src, { ...bodyOf(node.parent), from: node.from });
			out.push(im.core.readCall(cursor, cursor.next()!));
		}
		node = node.firstChild ?? node.nextSibling ?? nextUp(node, env);
	}
	return out;
}

function nextUp(node: SyntaxNode, root: SyntaxNode): SyntaxNode | null {
	for (let up = node.parent; up && up !== root; up = up.parent) if (up.nextSibling) return up.nextSibling;
	return null;
}

/** the float's own source with the image, caption and label swapped for the slots the serializer fills */
function templateOf(im: TreeImport, env: TreeEnvironment, slots: [ImportCall | undefined, string][]): string {
	const placed = slots.filter((s): s is [ImportCall, string] => !!s[0]).sort((a, b) => a[0].from - b[0].from);
	let out = '';
	let at = env.from;
	for (const [call, slot] of placed) {
		// a label inside the caption stays in it
		if (call.from < at) continue;
		out += im.src.slice(at, call.from) + slot;
		at = call.to;
	}
	return out + im.src.slice(at, env.to);
}

function opensAsText(im: TreeImport, env: TreeEnvironment): boolean {
	const blocks = otherFloatBlocks(im, env.name, env.body);
	return blocks.length > 0 && blocks.every((block) => block.type.name !== 'raw_latex');
}

export function figureBlocks(im: TreeImport, env: TreeEnvironment, ctx: ConversionContext): PmNode[] | null {
	const graphics = callsNamed(im, env.node, 'includegraphics');
	if (!graphics.length && env.name !== 'wrapfigure' && opensAsText(im, env)) return null;
	const captions = callsNamed(im, env.node, 'caption');
	const labels = callsNamed(im, env.node, 'label');
	// the image holds one caption; a float with more (subfigures) is a group of panels. A second label stays where it is written
	if (graphics.length > 1) return figureGroupBlocks(im, env, ctx, graphics) ?? [im.core.raw(env)];
	if (graphics.length !== 1 || captions.length > 1) return [im.core.raw(env)];
	const image = imageOf(im, graphics[0]);
	if (!image?.length) return [im.core.raw(env)];
	const caption = captions[0];
	const captionArg = caption ? mandatoryArgs(caption).find((a) => a.body && a.body.to > a.body.from) : undefined;
	const captionNodes = captionArg?.body ? im.core.inline(captionArg.body, ctx) : [];
	// the slot replaces the whole \caption, so \caption[short]{long}'s short one rides along
	const short = caption ? optionalArg(caption) : undefined;
	const label = labels[0] ? argTextContent(im, mandatoryArgs(labels[0])[0]) || null : null;
	const figureTemplate = templateOf(im, env, [
		[graphics[0], FIG_IMG_SLOT],
		[caption, FIG_CAP_SLOT],
		[labels[0], FIG_LAB_SLOT]
	]);
	return [
		im.core.node(
			'image',
			{
				...image[0].attrs,
				label,
				figureTemplate,
				captionOpt: short ? argText(im.src, short) : null,
				// \caption* is unnumbered, as the editor's numbered toggle means
				numbered: caption ? !hasStar(caption) : true,
				bareOriginal: false
			},
			captionNodes.length > 0 ? captionNodes : null
		)
	];
}
