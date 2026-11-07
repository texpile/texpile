// a heading command inside a chip (a macro that expands to \section*{Acknowledgments}), set as the page sets that level
import { faceElement, faceOfParts, tip, type ChipFace } from '$lib/languages/latex/visual/core';
import './headingPart.css';

export function headingPart(level: number, parts: ChipFace[], source: string): ChipFace {
	const dom = faceElement('div', `drawn-heading drawn-heading-${Math.min(Math.max(level, 0), 4)}`);
	const body = faceOfParts(parts, false);
	dom.appendChild(body.dom);
	const tipped = tip(dom, source);
	return {
		dom,
		line: true,
		decorate: (decorations) => body.decorate?.(decorations),
		destroy() {
			body.destroy?.();
			tipped.destroy();
		}
	};
}
