// spacing drawn at its real size against the editor's own em: a vertical space as an arrow from its top to its bottom
// labelled with the command and its length, a horizontal one as a gap in the line
import { tip } from '$lib/components/tooltip.svelte';
import type { ChipFace } from './chipFace';

/** a length as the editor draws it: in ems of the editor's font, as a share of the text width, or `fill`, stretching
 *  to whatever is left */
export type DrawnLength = { em: number } | { share: number } | { fill: true };

// the tallest a vertical space is drawn and the widest a horizontal one, so a page-sized skip does not push the text away
const MOST_EMS = 10;
// the arrow and its label need this much height whatever the space; below it (and for pulls upward) only the label tells
const LEAST_EMS = 1.4;
const FILL_EMS = 2;

const SVG = 'http://www.w3.org/2000/svg';
const POINTS_UP = 'M4.5 0 L9 6 L0 6 Z';
const POINTS_DOWN = 'M0 0 L9 0 L4.5 6 Z';

function arrowHead(path: string): SVGSVGElement {
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', '0 0 9 6');
	svg.setAttribute('class', 'drawn-vspace-head');
	svg.appendChild(document.createElementNS(SVG, 'path')).setAttribute('d', path);
	return svg;
}

/** heads at both ends of a line; a pull upward points them at each other */
function verticalArrow(negative: boolean): HTMLElement {
	const arrow = document.createElement('span');
	arrow.className = 'drawn-vspace-arrow';
	arrow.appendChild(arrowHead(negative ? POINTS_DOWN : POINTS_UP));
	arrow.appendChild(document.createElement('span')).className = 'drawn-vspace-shaft';
	arrow.appendChild(arrowHead(negative ? POINTS_UP : POINTS_DOWN));
	return arrow;
}

/** `command` is the space's command as the language writes it (\vspace, #v) */
export function verticalSpaceFace(command: string, length: DrawnLength | null, label: string, source: string): ChipFace {
	const dom = document.createElement('span');
	dom.className = 'drawn-vspace';
	const ems = length && 'em' in length ? length.em : length && 'fill' in length ? FILL_EMS : 0;
	dom.style.height = `${Math.min(MOST_EMS, Math.max(LEAST_EMS, ems))}em`;
	dom.appendChild(verticalArrow(ems < 0));
	const name = dom.appendChild(document.createElement('span'));
	name.className = 'drawn-space-command';
	name.textContent = command;
	if (label) {
		const size = dom.appendChild(document.createElement('span'));
		size.className = 'drawn-space-length';
		size.textContent = label;
	}
	const tipped = tip(dom, source);
	return { dom, line: true, destroy: () => tipped.destroy() };
}

/** `marked` draws the gap's extent (an \hspace); the plain spaces (\quad, \,) are just room in the line */
export function horizontalSpaceFace(length: DrawnLength | null, source: string, marked: boolean): ChipFace {
	const dom = document.createElement('span');
	dom.className = marked ? 'drawn-hspace' : 'drawn-space';
	if (!length) dom.style.width = '1em';
	else if ('share' in length) dom.style.width = `${Math.max(0, Math.min(100, length.share * 100))}%`;
	else if ('fill' in length) dom.style.width = `${FILL_EMS}em`;
	else if (length.em < 0) dom.classList.add('drawn-hspace-negative');
	else dom.style.width = `${Math.min(MOST_EMS * 2, length.em)}em`;
	const tipped = tip(dom, source);
	return { dom, character: true, destroy: () => tipped.destroy() };
}
