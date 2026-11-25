import { faceElement, setLook } from '$lib/editor/canvas';
import { type ChipFace } from '$lib/languages/latex/visual/core';

export function panelFace(body: ChipFace[], caption: ChipFace[] | null): ChipFace | null {
	const parts = [...body, ...(caption ?? [])];
	const dom = faceElement('span', 'drawn-panel');
	setLook(dom, { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'top', margin: '0 0.5em' });
	const shown = dom.appendChild(faceElement('span', 'drawn-panel-body'));
	for (const part of body) shown.appendChild(part.dom);
	if (caption?.length) {
		const words = dom.appendChild(faceElement('span', 'drawn-panel-caption'));
		setLook(words, { fontSize: '0.9em' });
		for (const part of caption) words.appendChild(part.dom);
	}
	return {
		dom,
		decorate: (decorations) => parts.forEach((part) => part.decorate?.(decorations)),
		destroy: () => parts.forEach((part) => part.destroy?.()),
		actions: () => parts.flatMap((part) => part.actions?.() ?? [])
	};
}
