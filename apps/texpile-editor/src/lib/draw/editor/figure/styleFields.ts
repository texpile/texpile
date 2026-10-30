import type { StyleFieldSet, StyleTarget } from './figureLanguage';

/** what a statement of this target usually takes; `open`: a path with ends, which takes arrows and no fill */
export function styleFieldsOf(target: StyleTarget, open: boolean): StyleFieldSet {
	const lined = target !== 'fill';
	const node = target === 'node';
	return { stroke: lined, fill: !open, width: lined, dash: lined, arrows: open, text: node, corners: !node && !open, opacity: true };
}

/** none of them */
export const NO_STYLE_FIELDS: StyleFieldSet = {
	stroke: false,
	fill: false,
	width: false,
	dash: false,
	arrows: false,
	text: false,
	corners: false,
	opacity: false
};
