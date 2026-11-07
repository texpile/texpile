// a structural command drawn as a labelled line across the column (a page break, the appendix, the bibliography)
import { faceElement, tippedFace, type ChipFace } from './chipFace';

export function dividerFace(label: string, source: string): ChipFace {
	const dom = faceElement('span', 'drawn-divider');
	dom.appendChild(faceElement('span', 'drawn-divider-label', label));
	return tippedFace(dom, source, { line: true });
}
