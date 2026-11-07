import {
	argText,
	createDefaultContext,
	hasStar,
	isBlankStretch,
	noteBlockSpan,
	optionalArg,
	type PmNode,
	type Stretch,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';
import { floatTypes } from '$lib/languages/latex/knowledge/registries/floatTypes';
import { captionArgOf, isCaptionCall, isLabelCall } from './captionParts';

export function isFloat(name: string): boolean {
	return floatTypes().has(name.replace(/\*$/, ''));
}

function isBreak(u: Unit | undefined): boolean {
	return !u || (!u.call && u.piece.kind === 'node' && ['ParBreak', 'Environment'].includes(u.piece.node.name));
}

function meaningful(units: Unit[]): Unit[] {
	return units.filter((u) => u.piece.kind !== 'space' && !(u.piece.kind === 'node' && u.piece.node.name === 'Comment'));
}

function standsAlone(im: TreeImport, units: Unit[], i: number): boolean {
	const next = units[i + 1];
	const label = next?.call && isLabelCall(im, next.call) ? 1 : 0;
	return isBreak(units[i - 1]) && isBreak(units[i + 1 + label]);
}

export function otherFloatBlocks(im: TreeImport, float: string, body: Stretch): PmNode[] {
	const units = meaningful(im.core.unitsIn(body));
	const out: PmNode[] = [];
	let from = body.from;
	function blocksTo(to: number): void {
		const stretch = { parent: body.parent, from, to };
		if (!isBlankStretch(im.src, stretch)) out.push(...im.core.blocks(stretch));
	}
	units.forEach((u, i) => {
		if (!u.call || !isCaptionCall(im, u.call) || !standsAlone(im, units, i)) return;
		blocksTo(u.from);
		const words = captionArgOf(im, u.call);
		const short = optionalArg(u.call);
		const attrs = {
			float: float.replace(/\*$/, ''),
			starred: hasStar(u.call),
			captionOpt: short && short !== words ? argText(im.src, short) : null
		};
		const caption = im.core.node('float_caption', attrs, words?.body ? im.core.inline(words.body, createDefaultContext()) : null);
		out.push(noteBlockSpan(caption, { srcFrom: u.from, srcTo: u.to, size: 1 }));
		from = u.to;
	});
	blocksTo(body.to);
	return out;
}
