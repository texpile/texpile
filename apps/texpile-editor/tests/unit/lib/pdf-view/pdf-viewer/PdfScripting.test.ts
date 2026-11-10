// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { keepScriptedVisibility, type FormScripting } from '$lib/pdf-view/pdf-viewer/PdfScripting';

it('keeps the frame the script hid hidden when the layer is built again', () => {
	const layer = document.createElement('div');
	layer.innerHTML =
		'<section data-annotation-id="1R"></section><section data-annotation-id="2R" style="visibility: hidden"></section><section data-annotation-id="3R"></section>';
	const stored: Record<string, object> = { '1R': { noView: true }, '2R': { noView: false } };
	const forms = { enableScripting: true, annotationStorage: { getRawValue: (id: string) => stored[id] } } as unknown as FormScripting;
	keepScriptedVisibility(layer, forms);
	expect([...layer.querySelectorAll('section')].map((s) => s.style.visibility)).toEqual(['hidden', 'visible', '']);
});
