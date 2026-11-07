// a call of Typst's own element that wraps what it is given, drawn as that content in the box or text the call's arguments
// make: `#box(..)`, `#text(11pt)[..]`, `#rect(fill: ..)`, `#quote[..]`
import {
	tip,
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
import './element.css';

// the properties that make an inline element a box of its own
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
	const dom = document.createElement(block ? 'div' : 'span');
	dom.className = block || !BOXED.some((property) => property in style) ? 'drawn-typst-element' : 'drawn-typst-element drawn-typst-boxed';
	for (const [property, value] of Object.entries(style))
		dom.style.setProperty(
			property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
			value
		);
	if (around[0]) dom.append(around[0]);
	if (inner) dom.append(inner.dom);
	if (around[1]) dom.append(around[1]);
	const tipped = tip(dom, use.source);
	const drawings: ArgumentDrawing[] = inner ? [inner] : [];
	return {
		dom,
		line: block,
		decorate: (decorations) => drawings.forEach((drawing) => drawing.faces.forEach((face) => face.decorate?.(decorations))),
		destroy() {
			destroyDrawings(drawings);
			tipped.destroy();
		}
	};
}
