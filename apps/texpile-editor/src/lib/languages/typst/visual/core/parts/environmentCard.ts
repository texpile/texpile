import { FaceElement, setLook } from '$lib/editor/canvas';
import { appendTo, elementMode, type PartElement } from '$lib/editor/visual/extensions/drawnChips/faces/partElements';
import { strValue } from '../../../knowledge/scan/syntax';
import { typstElement, TYPST_BODY_AFTER_LOOK } from '../looks/typstLooks';
import { blockMarkup, type CallArg, type TypstCall } from '../reading/typstCall';
import type { TypstDrawer } from '../plugin/typstPlugin';
import type { MarkupDrawing } from './drawingFace';

function titleDrawing(arg: CallArg, call: TypstCall, drawer: TypstDrawer): MarkupDrawing | null {
	if (arg.kind === 'ContentBlock') return drawer.drawMarkup(blockMarkup(arg));
	const text = arg.kind === 'Str' ? strValue(arg.node, call.source) : null;
	if (text === null) return null;
	return { dom: typstElement('span', '', text), block: false, empty: false, faces: [] };
}

/** `printedHead`: the theorem head the paper's maker prints in place of the name, which makes the card a plain run */
export function environmentCard(
	name: string,
	call: TypstCall,
	drawer: TypstDrawer,
	printedHead: PartElement | null = null
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
	const mode = elementMode(typstElement);
	const theorem = printedHead !== null;
	const dom = mode.make('div', theorem ? 'typ-environment typ-environment-theorem' : 'typ-environment');
	const head = appendTo(mode.make('div', theorem ? 'typ-env-header typ-env-header-theorem' : 'typ-env-header'));
	const heading = appendTo(mode.make('div', 'typ-env-heading'));
	appendTo(heading, printedHead ? mode.of(printedHead) : mode.make('span', 'env-label', name));
	for (const title of titles) appendTo(heading, appendTo(mode.make('span', 'typ-env-title'), '(', mode.of(title!.dom), ')'));
	appendTo(head, heading);
	const content = appendTo(mode.make('div', 'typ-environment-body'), ...drawings.map((drawing) => mode.of(drawing!.dom)));
	if (theorem && content instanceof FaceElement) afterBody(content);
	appendTo(dom, head, content);
	return { dom, block: true, empty: false, faces };
}

function afterBody(content: FaceElement): void {
	const after = typstElement('span');
	after.generated = true;
	setLook(after, TYPST_BODY_AFTER_LOOK);
	Object.assign(content, { generatedAfter: after });
}
