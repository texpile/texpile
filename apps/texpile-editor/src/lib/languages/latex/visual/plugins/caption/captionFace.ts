// a caption the parse leaves in the text (in a minipage, after \captionof): "Figure: words", as a float's caption reads
import { faceElement, faceOfParts, floatName, type ChipFace } from '$lib/languages/latex/visual/core';
import { floatTypes } from '$lib/languages/latex/knowledge/registries/floatTypes';
import { m } from '$lib/paraglide/messages';

/** the float the chip stands in, read off the environments drawn around it */
function enclosingFloat(dom: HTMLElement): string | null {
	for (let at = dom.parentElement?.closest<HTMLElement>('[data-env]'); at; at = at.parentElement?.closest('[data-env]')) {
		const name = (at.dataset.env ?? '').replace(/\*$/, '');
		if (floatTypes().has(name)) return name;
	}
	return null;
}

function headOf(float: string | null): string {
	return `${float ? floatName(float) : m.caption_head()}: `;
}

/** `float` is the type \captionof names; a \caption finds its float once the chip is in the page */
export function captionFace(float: string | null, words: ChipFace[]): ChipFace {
	const dom = faceElement('span', 'drawn-caption');
	const head = faceElement('span', 'float-caption-head', headOf(float));
	const text = faceOfParts(words, false);
	dom.append(head, text.dom);
	let frame = 0;
	if (!float && typeof requestAnimationFrame === 'function')
		frame = requestAnimationFrame(() => (head.textContent = headOf(enclosingFloat(dom))));
	return {
		dom,
		decorate: text.decorate,
		destroy: () => {
			if (frame) cancelAnimationFrame(frame);
			text.destroy?.();
		}
	};
}
