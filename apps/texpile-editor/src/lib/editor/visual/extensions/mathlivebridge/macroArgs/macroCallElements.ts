// the boxes the MathLive fork marks for a document's own macros
import type { MathfieldElement } from 'mathlive';

export const MACRO_PART = 'macro';

export function macroCallIn(event: Event): HTMLElement | null {
	for (const target of event.composedPath()) {
		if (target instanceof HTMLElement && target.part.contains(MACRO_PART)) return target;
		if (target === event.currentTarget) return null;
	}
	return null;
}

export function macroCommand(box: HTMLElement): string {
	return /^\\([a-zA-Z@]+)/.exec(box.dataset.latex ?? '')?.[1] ?? '';
}

export function macroCalls(field: MathfieldElement): HTMLElement[] {
	return [...(field.shadowRoot?.querySelectorAll<HTMLElement>(`[part~="${MACRO_PART}"]`) ?? [])];
}

export function macroOrdinal(field: MathfieldElement, box: HTMLElement): number {
	const command = macroCommand(box);
	return macroCalls(field)
		.filter((other) => macroCommand(other) === command)
		.indexOf(box);
}

export function macroRange(field: MathfieldElement, box: HTMLElement): [number, number] | null {
	const rect = box.getBoundingClientRect();
	const x = rect.left + rect.width / 2;
	const y = rect.top + rect.height / 2;
	const range: [number, number] = [field.getOffsetFromPoint(x, y, { bias: -1 }), field.getOffsetFromPoint(x, y, { bias: 1 })];
	return range[0] >= 0 && range[0] < range[1] ? range : null;
}

export function macroCallAgain(field: MathfieldElement, command: string, ordinal: number): HTMLElement | null {
	return macroCalls(field).filter((box) => macroCommand(box) === command)[ordinal] ?? null;
}

export function selectedCall(field: MathfieldElement): HTMLElement | null {
	const [from, to] = field.selection.ranges[0] ?? [0, 0];
	if (from === to) return null;
	return macroCalls(field).find((box) => macroRange(field, box)?.join() === [from, to].join()) ?? null;
}

/** a selected call is shown by its outline alone, as a selected text chip is, and takes Tab and Ctrl+Space */
export function markSelectedCall(field: MathfieldElement): void {
	field.toggleAttribute('data-macro-selected', !!selectedCall(field));
}

// a selection set from code fires no selection-change, so the mark is set here too
export function selectInField(field: MathfieldElement, range: [number, number]): void {
	// eslint-disable-next-line no-param-reassign -- a field takes its selection by assignment
	field.selection = { ranges: [range] };
	markSelectedCall(field);
}
