// `#stack(dir: ltr, spacing: 2mm, a, b)`, the call that lays its children out in a row or a column, drawn as them in it
import { faceElement, setLook } from '$lib/editor/canvas';
import {
	type ChipFace,
	type TypstDrawer,
	typstLengthCss,
	namedArg,
	positionalArgs,
	destroyDrawings,
	drawArgument,
	type ArgumentDrawing
} from '$lib/languages/typst/visual/core';
import { DIRECTIONS, readStack } from './stackCall';

export function stackFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const read = readStack(source);
	if (!read) return null;
	const { use, direction } = read;
	const drawings: ArgumentDrawing[] = [];
	for (const child of positionalArgs(use.call)) {
		const drawn = drawArgument(child, drawer);
		if (!drawn) {
			destroyDrawings(drawings);
			return null;
		}
		drawings.push(drawn);
	}
	const dom = faceElement('div', 'drawn-typst-element drawn-typst-stack');
	const spacing = namedArg(use.call, 'spacing');
	const gap = spacing ? typstLengthCss(spacing.node, use.call.source) : null;
	setLook(dom, {
		display: 'flex',
		boxSizing: 'border-box',
		maxWidth: '100%',
		flexDirection: direction ? DIRECTIONS[direction.value] : 'column',
		...(gap ? { gap } : {})
	});
	for (const drawn of drawings) dom.append(drawn.dom);
	dom.hint = use.source;
	return {
		dom,
		line: true,
		decorate: (decorations) => drawings.forEach((drawn) => drawn.faces.forEach((face) => face.decorate?.(decorations))),
		destroy: () => destroyDrawings(drawings)
	};
}
