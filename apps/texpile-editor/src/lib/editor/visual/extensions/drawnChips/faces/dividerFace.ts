// a structural command drawn as a labelled line across the column (a page break, the appendix, the bibliography)
import { faceElement, setLook, type FaceElement } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';
import { DIVIDER_RULE_LOOK } from '../looks/lineLooks';

function dividerRule(): FaceElement {
	const rule = faceElement('span');
	rule.generated = true;
	setLook(rule, DIVIDER_RULE_LOOK);
	return rule;
}

export function dividerFace(label: string, source: string): ChipFace {
	const dom = chipElement('span', 'drawn-divider');
	dom.generatedBefore = dividerRule();
	dom.generatedAfter = dividerRule();
	dom.appendChild(chipElement('span', 'drawn-divider-label', label));
	return tippedFace(dom, source, { line: true });
}
