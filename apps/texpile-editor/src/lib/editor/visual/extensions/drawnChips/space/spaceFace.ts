// spacing drawn at its real size against the editor's own em: a vertical space as an arrow from its top to its bottom
// labelled with the command and its length, a horizontal one as a gap in the line
import { setLook, type FaceElement } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';
import { NEGATIVE_HSPACE_LOOK } from '../looks/spaceLooks';
import { verticalArrow } from './verticalArrow';

/** a length as the editor draws it: in ems of the editor's font, as a share of the text width, or `fill`, stretching
 *  to whatever is left */
export type DrawnLength = { em: number } | { share: number } | { fill: true };

// the tallest a vertical space is drawn and the widest a horizontal one, so a page-sized skip does not push the text away
const MOST_EMS = 10;
// the arrow and its label need this much height whatever the space; below it (and for pulls upward) only the label tells
const LEAST_EMS = 1.4;
const FILL_EMS = 2;

/** `command` is the space's command as the language writes it (\vspace, #v) */
export function verticalSpaceFace(command: string, length: DrawnLength | null, label: string, source: string): ChipFace {
	const dom = chipElement('span', 'drawn-vspace');
	const ems = length && 'em' in length ? length.em : length && 'fill' in length ? FILL_EMS : 0;
	const height = Math.min(MOST_EMS, Math.max(LEAST_EMS, ems));
	dom.style.height = `${height}em`;
	dom.appendChild(verticalArrow(height, ems < 0));
	dom.appendChild(chipElement('span', 'drawn-space-command', command));
	if (label) dom.appendChild(chipElement('span', 'drawn-space-length', label));
	return tippedFace(dom, source, { line: true });
}

/** `marked` draws the gap's extent (an \hspace); the plain spaces (\quad, \,) are just room in the line */
export function horizontalSpaceFace(length: DrawnLength | null, source: string, marked: boolean): ChipFace {
	const dom: FaceElement = chipElement('span', marked ? 'drawn-hspace' : 'drawn-space');
	if (!length) dom.style.width = '1em';
	else if ('share' in length) dom.style.width = `${Math.max(0, Math.min(100, length.share * 100))}%`;
	else if ('fill' in length) dom.style.width = `${FILL_EMS}em`;
	else if (length.em < 0) {
		dom.classList.add('drawn-hspace-negative');
		setLook(dom, NEGATIVE_HSPACE_LOOK);
	} else dom.style.width = `${Math.min(MOST_EMS * 2, length.em)}em`;
	return tippedFace(dom, source, { character: true });
}
