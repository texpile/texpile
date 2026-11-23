// the formula views' looks (document.css, app.css): the display's container and field, its numbers, and the formula's frames
import type { StyleLook } from '../contracts/styleTypes';
import { faceElement, type FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';

export const DISPLAY_CONTAINER: StyleLook = { display: 'flex', justifyContent: 'safe center', position: 'relative', alignItems: 'center' };
export const DISPLAY_FIELD: StyleLook = { maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden' };

const NUMBER_PLACE: StyleLook = {
	position: 'absolute',
	right: '16px',
	top: '50%',
	translate: '0 -50%',
	pointerEvents: 'none',
	userSelect: 'none'
};
const NUMBER: StyleLook = { ...NUMBER_PLACE, fontWeight: '500', color: 'var(--muted-text)' };

const NO_FRAME: StyleLook = { outline: '', outlineOffset: '', borderRadius: '', backgroundColor: '' };
const SELECTED_FRAME: StyleLook = {
	...NO_FRAME,
	outline: '1px solid var(--mathfield-focus-border)',
	outlineOffset: '2px',
	borderRadius: '3px'
};
const EMPTY_FRAME: StyleLook = { ...NO_FRAME, outline: '1px solid var(--color-error-500)', outlineOffset: '2px', borderRadius: '3px' };
const PENDING_FRAME: StyleLook = { ...EMPTY_FRAME, backgroundColor: 'color-mix(in srgb, var(--math-empty-tint) 10%, transparent)' };

/** the number after a single-number display, beside the column's edge */
export function equationNumber(text: string): FaceElement {
	const part = faceElement('span');
	part.generated = true;
	part.textContent = text;
	setLook(part, NUMBER);
	return part;
}

export type FormulaFrame = { selected: boolean; empty: boolean; pending: boolean };

const frames = new WeakMap<FaceElement, FormulaFrame>();

/** T6: an empty formula keeps an error frame where it stands, tinted once a Backspace armed its delete; it wins over the
 *  selected formula's frame, which a display draws on its field instead */
export function frameFormula(el: FaceElement, change: Partial<FormulaFrame>): void {
	const frame = { ...(frames.get(el) ?? { selected: false, empty: false, pending: false }), ...change };
	frames.set(el, frame);
	if (change.empty !== undefined) el.classList.toggle('math-empty', frame.empty);
	if (change.pending !== undefined) el.classList.toggle('math-pending-delete', frame.pending);
	setLook(el, frame.pending ? PENDING_FRAME : frame.empty ? EMPTY_FRAME : frame.selected ? SELECTED_FRAME : NO_FRAME);
}

export function formulaFrameOf(el: FaceElement): FormulaFrame | null {
	return frames.get(el) ?? null;
}
