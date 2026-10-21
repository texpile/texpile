// a document's own macros in a formula open like text chips do
import { tip } from '$lib/components/tooltip.svelte';
import { ownMacroDefinition } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/ownMacroFace.svelte';
import { readOwnMacroCall } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/ownMacroCall';
import { macroCallIn, macroCalls, macroCommand, macroRange, markSelectedCall, selectInField, selectedCall } from './macroCallElements';
import type { MathfieldElement } from 'mathlive';
import { openMathMacroPanel, type MathMacroHost } from './mathMacroPanel';
import { isSearchKey } from '../mathSearch/mathSearchKeys';

function plainKey(event: KeyboardEvent | MouseEvent): boolean {
	return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function callBeforeCaret(field: MathfieldElement): HTMLElement | null {
	const [from, to] = field.selection.ranges[0] ?? [0, 0];
	if (from !== to || field.mode === 'latex') return null;
	return macroCalls(field).find((box) => macroRange(field, box)?.[1] === to) ?? null;
}

function nextCall(field: MathfieldElement, forward: boolean): [number, number] | null {
	const at = field.position;
	for (const box of macroCalls(field)) {
		const range = macroRange(field, box);
		if (range?.[forward ? 0 : 1] === at) return range;
	}
	return null;
}

export function watchMacroCalls(host: MathMacroHost, field: MathfieldElement): () => void {
	let hinted: { box: HTMLElement; destroy(): void } | null = null;
	let live = true;

	function unhint(): void {
		hinted?.destroy();
		hinted = null;
	}
	// MathLive redraws its boxes in place, so each hover takes the box under the pointer now
	function onPointerOver(event: PointerEvent): void {
		const box = macroCallIn(event);
		if (box === hinted?.box) return;
		unhint();
		if (box) hinted = { box, ...tip(box, box.dataset.latex) };
	}
	// Chrome still moves focus on a press whose pointerdown was cancelled; cancelling the mousedown keeps it in the panel
	function keepFocus(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}
	function onPointerDown(event: PointerEvent): void {
		// a cancelled touch or pen press leaves the last one armed
		field.removeEventListener('mousedown', keepFocus, { capture: true });
		const box = event.button === 0 && plainKey(event) ? macroCallIn(event) : null;
		if (!box || !openMathMacroPanel(host, field, box)) return;
		event.stopPropagation();
		field.addEventListener('mousedown', keepFocus, { capture: true, once: true });
		unhint();
	}
	// a macro typed with nothing after it would take the next token as its argument; it gets empty ones and opens on them
	function onInput(): void {
		const box = callBeforeCaret(field);
		const command = box ? macroCommand(box) : '';
		const definition = ownMacroDefinition(command);
		const range = box && macroRange(field, box);
		if (!box || !range || !definition || readOwnMacroCall(box.dataset.latex ?? '', definition)) return;
		const mandatory = (definition.args ?? 0) - (definition.optional === undefined ? 0 : 1);
		selectInField(field, range);
		field.insert(`\\${command}${'{}'.repeat(mandatory)}`, { format: 'latex', selectionMode: 'after' });
		host.forwardupdate();
		// once MathLive has drawn the call anew
		requestAnimationFrame(() => {
			if (!live || !field.isConnected) return;
			const typed = callBeforeCaret(field);
			if (typed) openMathMacroPanel(host, field, typed);
		});
	}
	function onSelectionChange(): void {
		markSelectedCall(field);
	}
	function onKeyDown(event: KeyboardEvent): void {
		if (field.mode === 'latex' || !event.composedPath().includes(field)) return;
		// Tab and Ctrl+Space on a selected call open its arguments, where elsewhere they open math search
		const opens = (plainKey(event) && (event.key === 'Enter' || event.key === 'Tab')) || isSearchKey(event);
		if (!opens && !plainKey(event)) return;
		const forward = event.key === 'ArrowRight';
		if (opens) {
			const box = selectedCall(field);
			if (!box || !openMathMacroPanel(host, field, box)) return;
		} else if (forward || event.key === 'ArrowLeft') {
			const [from, to] = field.selection.ranges[0] ?? [0, 0];
			if (from !== to) {
				if (!selectedCall(field)) return;
				selectInField(field, forward ? [to, to] : [from, from]);
			} else {
				const range = nextCall(field, forward);
				if (!range) return;
				selectInField(field, range);
			}
		} else return;
		event.preventDefault();
		event.stopPropagation();
	}

	field.addEventListener('input', onInput);
	field.addEventListener('selection-change', onSelectionChange);
	field.addEventListener('pointerover', onPointerOver);
	field.addEventListener('pointerleave', unhint);
	field.addEventListener('pointerdown', onPointerDown, { capture: true });
	// on the field's container: mathlive's own keys are on the field from before this ran, and take these first
	const keys = field.parentElement ?? field;
	keys.addEventListener('keydown', onKeyDown, { capture: true });
	return () => {
		live = false;
		unhint();
		field.removeEventListener('input', onInput);
		field.removeEventListener('selection-change', onSelectionChange);
		field.removeAttribute('data-macro-selected');
		field.removeEventListener('pointerover', onPointerOver);
		field.removeEventListener('pointerleave', unhint);
		field.removeEventListener('pointerdown', onPointerDown, { capture: true });
		field.removeEventListener('mousedown', keepFocus, { capture: true });
		keys.removeEventListener('keydown', onKeyDown, { capture: true });
	};
}
