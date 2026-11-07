// `#stack(dir: ltr, spacing: 2mm, a, b)`, the call that lays its children out in a row or a column, drawn as them in it
import {
	tip,
	faceElement,
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
import './stack.css';

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
	dom.style.flexDirection = direction ? DIRECTIONS[direction.value] : 'column';
	const spacing = namedArg(use.call, 'spacing');
	const gap = spacing ? typstLengthCss(spacing.node, use.call.source) : null;
	if (gap) dom.style.gap = gap;
	for (const drawn of drawings) dom.append(drawn.dom);
	const tipped = tip(dom, use.source);
	return {
		dom,
		line: true,
		decorate: (decorations) => drawings.forEach((drawn) => drawn.faces.forEach((face) => face.decorate?.(decorations))),
		destroy() {
			destroyDrawings(drawings);
			tipped.destroy();
		}
	};
}
