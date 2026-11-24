// the formula being edited in a visual editor, which the toolbars, the symbol panel and math search act on (T21)
import type { HeadlessMathfield } from 'mathlive';
import type { VisualView } from '$lib/editor/canvas';
import { box } from '$lib/runes/box.svelte';

export type ActiveMath = {
	readonly view: VisualView;
	readonly field: HeadlessMathfield;
	readonly display: boolean;
	/** the formula's node position now */
	pos(): number;
};

export const activeMath = box<ActiveMath | null>(null);

/** the toolbar's palette, the toolbar itself and a macro call's chip panel keep the formula being edited */
export function keepsMathFocus(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('[data-scope], [data-math-toolbar], .drawn-chip-panel') !== null;
}
