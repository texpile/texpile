// A12: a per-row environment's numbers, each on the baseline of its own row, read from the formula's layout
import type { StyleLook } from '../contracts/styleTypes';
import { canvasFontOf } from '../layout/text/fontStrings';
import { canvasFill } from '../style/resolve/colorValue';
import { faceElement, type FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';
import { formulaLaidOut } from './mathReplaced';

// as tall as the formula and centered as it is, so a row's baseline in the formula is a baseline here
const ROW_NUMBERS: StyleLook = {
	position: 'absolute',
	right: '16px',
	top: '50%',
	translate: '0 -50%',
	pointerEvents: 'none',
	userSelect: 'none',
	fontWeight: '500',
	fontSize: '0.95em',
	color: 'var(--muted-text)'
};
// the numbers are drawn against the box's right edge, so its width only bounds them: about a digit's advance each
const CHARACTER_EM = 0.6;

/** numbers[i] stands on row i; a null row (\nonumber, \notag) shows none */
export function rowNumbersElement(formula: FaceElement, numbers: readonly (string | null)[]): FaceElement {
	const el = faceElement('span', 'equation-numbers');
	setLook(el, ROW_NUMBERS);
	let font = '';
	el.replaced = {
		intrinsic(style) {
			const laid = formulaLaidOut(formula);
			if (!laid) return null;
			const { sizePx } = style.layout.font;
			font = canvasFontOf(style.layout.font);
			const width = Math.max(0, ...numbers.map((number) => (number?.length ?? 0) * CHARACTER_EM * sizePx));
			return { width, height: laid.placing.ascent + laid.placing.descent, baseline: laid.placing.ascent };
		},
		paint(ctx, box, style) {
			const laid = formulaLaidOut(formula);
			if (!laid) return;
			/* eslint-disable no-param-reassign -- painting sets the canvas context's state */
			ctx.font = font;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'alphabetic';
			ctx.fillStyle = canvasFill(style.color);
			/* eslint-enable no-param-reassign */
			laid.layout.rows.forEach((row, i) => {
				const number = numbers[i];
				if (number) ctx.fillText(number, box.x + box.width, box.y + laid.placing.ascent + row.baseline * laid.placing.size);
			});
		}
	};
	return el;
}
