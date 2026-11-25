import { faceElement, setLook, type StyleLook } from '$lib/editor/canvas';
import {
	type ChipFace,
	type TypstDrawer,
	namedArg,
	destroyDrawings,
	drawArgument,
	type ArgumentDrawing
} from '$lib/languages/typst/visual/core';
import { printedAround, readElement } from './elementCall';
import { elementStyle } from './elementStyle';
import { blockLevelOf } from '$lib/languages/typst/knowledge';

const BOXED = ['background', 'border', 'padding', 'width', 'minHeight'];

export function elementFace(source: string, drawer: TypstDrawer): ChipFace | null {
	const read = readElement(source);
	if (!read) return null;
	const { use, body } = read;
	const around = printedAround(use.entry)!;
	const inner = body ? drawArgument(body, drawer) : null;
	if (body && !inner) return null;
	const level = blockLevelOf(use.entry, (name) => namedArg(use.call, name)?.value ?? null);
	const block = level === 'content' ? !!inner?.block : level === true;
	const style = elementStyle(use.call, use.entry);
	const boxed = !block && BOXED.some((property) => property in style);
	const dom = faceElement(block ? 'div' : 'span', boxed ? 'drawn-typst-element drawn-typst-boxed' : 'drawn-typst-element');
	setLook(dom, {
		boxSizing: 'border-box',
		maxWidth: '100%',
		...(boxed ? { display: 'inline-block', verticalAlign: 'baseline' } : {}),
		...(style as StyleLook)
	});
	if (around[0]) dom.append(around[0]);
	if (inner) dom.append(inner.dom);
	if (around[1]) dom.append(around[1]);
	dom.hint = use.source;
	const drawings: ArgumentDrawing[] = inner ? [inner] : [];
	return {
		dom,
		line: block,
		decorate: (decorations) => drawings.forEach((drawing) => drawing.faces.forEach((face) => face.decorate?.(decorations))),
		destroy: () => destroyDrawings(drawings)
	};
}
