import { setLook, type FaceElement } from '$lib/editor/canvas';
import { GLOSSARY_LOOKS } from '../looks/glossaryLooks';

export function showGlossaryTerm(dom: FaceElement, text: string, missing: boolean): void {
	dom.setAttribute('class', missing ? 'drawn-glossary drawn-glossary-missing' : 'drawn-glossary');
	dom.removeAttribute('style');
	setLook(dom, GLOSSARY_LOOKS['drawn-glossary']);
	if (missing) setLook(dom, GLOSSARY_LOOKS['drawn-glossary-missing']);
	// written again as it was, it reads as a change of size to the line breaker
	if (dom.textContent !== text) dom.replaceChildren(text);
}
