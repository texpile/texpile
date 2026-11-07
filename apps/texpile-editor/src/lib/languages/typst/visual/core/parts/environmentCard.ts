// a call whose maker only Typst can run, drawn as its name over the content it is given
import { faceElement } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { strValue } from '../../../knowledge/scan/syntax';
import { blockMarkup, type CallArg, type TypstCall } from '../reading/typstCall';
import type { TypstDrawer } from '../plugin/typstPlugin';
import type { MarkupDrawing } from './drawingFace';

/** what an argument prints in the header: a title, written as a string or content; null when it may print something else */
function titleDrawing(arg: CallArg, call: TypstCall, drawer: TypstDrawer): MarkupDrawing | null {
	if (arg.kind === 'ContentBlock') return drawer.drawMarkup(blockMarkup(arg));
	const text = arg.kind === 'Str' ? strValue(arg.node, call.source) : null;
	if (text === null) return null;
	const dom = document.createElement('span');
	dom.textContent = text;
	return { dom, block: false, empty: false, faces: [] };
}

/** `printedHead`: the head the maker prints, its note included, in place of the name and titles */
export function environmentCard(
	name: string,
	call: TypstCall,
	drawer: TypstDrawer,
	printedHead: HTMLElement | null = null
): MarkupDrawing | null {
	const titled = printedHead ? [] : call.args.filter((arg) => arg.name === null || arg.name === 'title');
	const titles = titled.filter((arg) => arg.kind !== 'None').map((arg) => titleDrawing(arg, call, drawer));
	const drawings = call.bodies.map((body) => drawer.drawMarkup(blockMarkup(body)));
	const all = [...titles, ...drawings];
	const faces = all.flatMap((drawing) => drawing?.faces ?? []);
	if (!drawings.length || all.includes(null)) {
		faces.forEach((face) => face.destroy?.());
		return null;
	}
	const dom = faceElement('div', 'typ-environment');
	const head = dom.appendChild(faceElement('div', 'typ-env-header'));
	const heading = head.appendChild(faceElement('div', 'typ-env-heading'));
	if (printedHead) heading.appendChild(printedHead);
	else {
		heading.appendChild(faceElement('span', 'env-label', name));
	}
	for (const title of titles) {
		const span = heading.appendChild(faceElement('span', 'typ-env-title'));
		span.append('(', title!.dom, ')');
	}
	const content = dom.appendChild(faceElement('div', 'typ-environment-body'));
	for (const drawing of drawings) content.appendChild(drawing!.dom);
	return { dom, block: true, empty: false, faces };
}
