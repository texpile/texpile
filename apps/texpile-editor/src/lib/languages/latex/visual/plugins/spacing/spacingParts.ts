import {
	argText,
	hasStar,
	HORIZONTAL_SPACES,
	horizontalSpaceFace,
	lengthLabel,
	mandatoryArgs,
	texLength,
	VERTICAL_SKIPS,
	verticalSpaceFace,
	type ChipFace,
	type TreeCall
} from '$lib/languages/latex/visual/core';
export function spacingPart(name: string, call: TreeCall, src: string, source: string): ChipFace | null {
	const args = mandatoryArgs(call);
	if (name === 'vspace' || name === 'addvspace') {
		const length = argText(src, args[0]);
		return verticalSpaceFace(`\\${name}${hasStar(call) ? '*' : ''}`, texLength(length), lengthLabel(length), source);
	}
	if (Object.hasOwn(VERTICAL_SKIPS, name))
		return verticalSpaceFace(`\\${name}`, { em: VERTICAL_SKIPS[name] / 10 }, `${VERTICAL_SKIPS[name]}pt`, source);
	if (name === 'vfill') return verticalSpaceFace('\\vfill', { fill: true }, '', source);
	if (name === 'hspace') return horizontalSpaceFace(texLength(argText(src, args[0])), source, true);
	if (name === 'hfill' || name === 'hfil') return horizontalSpaceFace({ fill: true }, source, true);
	if (Object.hasOwn(HORIZONTAL_SPACES, name)) return horizontalSpaceFace({ em: HORIZONTAL_SPACES[name] }, source, false);
	return null;
}
