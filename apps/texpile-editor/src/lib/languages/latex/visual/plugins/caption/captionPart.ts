import type { Argument } from '$lib/languages/latex/knowledge/types';
import {
	argWhere,
	hasRole,
	isSpacePart,
	readingsOf,
	type ChipFace,
	type LatexFaceCore,
	type TreeArg,
	type TreeCall
} from '$lib/languages/latex/visual/core';
import { captionFace } from './captionFace';
import { panelFace } from './panelFace';

export function isCaption(a: Argument): boolean {
	return a.part === 'caption';
}
function required(a: Argument): boolean {
	return /^[mrv]/.test(a.kind.replace(/^!/, ''));
}

function isPanelBody(a: Argument): boolean {
	return required(a) && hasRole('text')(a) && a.part === undefined;
}

function panelBodyOf(call: TreeCall): TreeArg | null {
	const reading = readingsOf(call.name).find((r) => r.some(isCaption) && r.some(isPanelBody));
	return reading ? argWhere(call, (a) => reading.includes(a) && isPanelBody(a)) : null;
}

function subfloatPart(call: TreeCall, body: TreeArg, core: LatexFaceCore): ChipFace | null {
	const caption = argWhere(call, isCaption);
	const short = argWhere(call, (a) => a.part === 'short');
	const words = caption?.present ? caption : short?.present ? short : null;
	const shown = core.draw(body);
	const captionParts = words ? core.draw(words) : [];
	if (!shown || !captionParts || captionParts.some((part) => part.line)) {
		[...(shown ?? []), ...(captionParts ?? [])].forEach((part) => part.destroy?.());
		return null;
	}
	return panelFace(shown, captionParts);
}

export function captionPart(call: TreeCall, core: LatexFaceCore): ChipFace | null {
	const panel = panelBodyOf(call);
	if (panel?.present) return subfloatPart(call, panel, core);
	const words = core.draw(argWhere(call, isCaption) ?? undefined);
	if (!words) return null;
	// a skip ending the words (LyX's \bigskip{}) spaces the caption from the float below it
	while (words.length && (words[words.length - 1].line || isSpacePart(words[words.length - 1]))) words.pop()?.destroy?.();
	if (words.some((part) => part.line)) return null;
	const float = argWhere(call, (a) => a.kind === 'm' && a.role === undefined && a.part === undefined);
	return captionFace(float?.present ? core.text(float).trim() : null, words);
}
