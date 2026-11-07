// a panel of a float (\subfloat, \subcaptionbox): what it holds over its own caption, beside the other panels
import { faceElement, type ChipFace } from '$lib/languages/latex/visual/core';
import './panel.css';

export function panelFace(body: ChipFace[], caption: ChipFace[] | null): ChipFace {
	const dom = faceElement('span', 'drawn-panel');
	const shown = faceElement('span', 'drawn-panel-body');
	shown.append(...body.map((part) => part.dom));
	dom.append(shown);
	if (caption?.length) {
		const words = faceElement('span', 'drawn-panel-caption');
		words.append(...caption.map((part) => part.dom));
		dom.append(words);
	}
	const parts = [...body, ...(caption ?? [])];
	return {
		dom,
		decorate: (decorations) => parts.forEach((part) => part.decorate?.(decorations)),
		destroy: () => parts.forEach((part) => part.destroy?.())
	};
}
