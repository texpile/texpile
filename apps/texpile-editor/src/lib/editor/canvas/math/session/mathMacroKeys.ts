// the paper's own macros in a formula (T11): a call is one unit for the arrows, and opens its chip panel
import { isSearchKey } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearchKeys';
import { ownMacroDefinition } from '$lib/languages/latex/visual/core/own/ownMacroFace.svelte';
import { readOwnMacroCall } from '$lib/languages/latex/visual/core/own/ownMacroCall';
import type { CanvasMathSession } from './mathSession';
import { openMathMacroPanel } from './mathMacroPanel';

type MacroCallRange = [number, number];

function plainKey(event: KeyboardEvent): boolean {
	return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/** the offsets a call covers: its box's middle read with each bias, as MathLive places a caret either side of it */
export function macroCallRange(session: CanvasMathSession, index: number): MacroCallRange | null {
	const rect = session.macroCallClientRect(index);
	if (!rect) return null;
	const x = rect.left + rect.width / 2;
	const y = rect.top + rect.height / 2;
	const { field } = session;
	const range: MacroCallRange = [field.getOffsetFromPoint(x, y, { bias: -1 }), field.getOffsetFromPoint(x, y, { bias: 1 })];
	return range[0] >= 0 && range[0] < range[1] ? range : null;
}

/** the index of the call the selection covers exactly */
export function selectedMacroCall(session: CanvasMathSession): number | null {
	const [from, to] = session.field.selection.ranges[0] ?? [0, 0];
	if (from === to) return null;
	const { macroCalls } = session.layout;
	for (let index = 0; index < macroCalls.length; index++) if (macroCallRange(session, index)?.join() === `${from},${to}`) return index;
	return null;
}

function callBeside(session: CanvasMathSession, forward: boolean): MacroCallRange | null {
	const at = session.field.position;
	for (let index = 0; index < session.layout.macroCalls.length; index++) {
		const range = macroCallRange(session, index);
		if (range?.[forward ? 0 : 1] === at) return range;
	}
	return null;
}

/** Enter, Tab or Ctrl+Space on a selected call opens it; Left and Right take a call whole */
export function macroCallKey(session: CanvasMathSession, event: KeyboardEvent): boolean {
	const { field } = session;
	if (session.syntax !== 'latex' || field.mode === 'latex' || !session.layout.macroCalls.length) return false;
	const opens = (plainKey(event) && (event.key === 'Enter' || event.key === 'Tab')) || isSearchKey(event);
	if (opens) {
		const index = selectedMacroCall(session);
		return index !== null && openMathMacroPanel(session, index);
	}
	if (!plainKey(event) || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return false;
	const forward = event.key === 'ArrowRight';
	const [from, to] = field.selection.ranges[0] ?? [0, 0];
	if (from !== to) {
		if (selectedMacroCall(session) === null) return false;
		field.selection = { ranges: [forward ? [to, to] : [from, from]] };
		return true;
	}
	const range = callBeside(session, forward);
	if (!range) return false;
	field.selection = { ranges: [range] };
	return true;
}

/** a macro typed with nothing after it would take the next token as its argument: it gets empty ones and opens on them */
export function completeTypedMacro(session: CanvasMathSession): void {
	const { field } = session;
	const [from, to] = field.selection.ranges[0] ?? [0, 0];
	if (session.syntax !== 'latex' || from !== to || field.mode === 'latex') return;
	const { macroCalls } = session.layout;
	const index = macroCalls.findIndex((_, i) => macroCallRange(session, i)?.[1] === to);
	if (index < 0) return;
	const call = macroCalls[index];
	const command = call.command.slice(1);
	const definition = ownMacroDefinition(command);
	const range = macroCallRange(session, index);
	if (!range || !definition || readOwnMacroCall(call.latex, definition)) return;
	const mandatory = (definition.args ?? 0) - (definition.optional === undefined ? 0 : 1);
	field.selection = { ranges: [range] };
	field.insert(`\\${command}${'{}'.repeat(mandatory)}`, { format: 'latex', selectionMode: 'after' });
	queueMicrotask(() => {
		if (session.isOver) return;
		const typed = session.layout.macroCalls.findIndex((_, i) => macroCallRange(session, i)?.[1] === field.position);
		if (typed >= 0) openMathMacroPanel(session, typed);
	});
}

/** a plain press on a call opens its panel */
export function macroCallAt(session: CanvasMathSession, clientX: number, clientY: number): number | null {
	for (let index = 0; index < session.layout.macroCalls.length; index++) {
		const rect = session.macroCallClientRect(index);
		if (rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return index;
	}
	return null;
}
