import { faceElement, tippedFace, type ChipFace } from './chipFace';

/** a part the compiler writes (a table of contents, a list of figures), named on a line of its own */
export function partLabelFace(label: string, source: string): ChipFace {
	return tippedFace(faceElement('div', 'latex-placeholder', label), source, { line: true });
}
