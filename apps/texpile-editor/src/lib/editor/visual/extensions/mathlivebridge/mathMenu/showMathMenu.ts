// the right-click menu of an equation in the visual editor, in place of MathLive's own
import type { MathfieldElement } from 'mathlive';
import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { arrayItems, clipboardItems, styleItems } from './mathFieldItems';
import { formulaItems, type MathMenuEquation } from './mathFormulaItems';

export function showMathMenu(field: MathfieldElement, equation: MathMenuEquation, at: { x: number; y: number }): void {
	const { editable } = equation;
	const sections = [
		clipboardItems(field, editable),
		formulaItems(equation),
		editable ? arrayItems(field) : [],
		editable ? styleItems(field) : []
	].filter((section) => section.length > 0);
	const items: ContextMenuItem[] = sections.flatMap((section, i) => (i ? [{ separator: true } as const, ...section] : section));
	void showContextMenu(items, at);
}
