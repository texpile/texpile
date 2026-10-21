// the chip panel on one macro call in a formula; it rewrites that call's bytes only
import type { MathfieldElement } from 'mathlive';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { chipPanelOpenFor, openChipPanel, syncChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { ownMacroDefinition } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/ownMacroFace.svelte';
import { ownMacroCallsIn } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/ownMacroCall';
import { macroCaret, macroFooter } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/macroFooter';
import { macroCallAgain, macroCommand, macroOrdinal, macroRange, selectInField } from './macroCallElements';
import { macroJumpOf } from './macroJump';

/** the formula's node view */
export type MathMacroHost = {
	readonly view: EditorView;
	readonly node: Node;
	getPos(): number;
	/** writes what the field holds into the document now, ahead of MathLive's deferred input event */
	forwardupdate(): void;
};

/** the panel hangs from this: MathLive redraws the call's own box on every edit */
function anchorOver(field: MathfieldElement, box: HTMLElement): HTMLElement {
	const anchor = document.createElement('span');
	anchor.className = 'math-macro-anchor';
	field.after(anchor);
	const rect = box.getBoundingClientRect();
	const parent = anchor.offsetParent as HTMLElement | null;
	const origin = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
	const left = rect.left - origin.left + (parent ? parent.scrollLeft - parent.clientLeft : 0);
	const top = rect.top - origin.top + (parent ? parent.scrollTop - parent.clientTop : 0);
	Object.assign(anchor.style, { left: `${left}px`, top: `${top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
	return anchor;
}

export function openMathMacroPanel(host: MathMacroHost, field: MathfieldElement, box: HTMLElement): boolean {
	const command = macroCommand(box);
	const definition = ownMacroDefinition(command);
	if (!definition || !host.view.editable || field.readOnly) return false;
	const ordinal = macroOrdinal(field, box);
	function located() {
		const latex = host.node.textContent;
		const at = ownMacroCallsIn(latex, command, ownMacroDefinition)[ordinal];
		return at ? { latex, ...at } : null;
	}
	const call = located();
	if (!call) return false;
	const anchor = anchorOver(field, box);
	function jumpToDefinition(name: string): void {
		macroJumpOf(host.view.state)(name);
	}
	// the call's place by the text around it, not found again: a half typed call stops reading as one, and the panel's
	// own edits and undos only ever change what lies between
	const before = call.from;
	const after = call.latex.length - call.to;
	function callNow(): string {
		const latex = host.node.textContent;
		return latex.slice(before, latex.length - after);
	}
	function write(next: string): void {
		const pos = host.getPos();
		const node = host.node;
		const latex = node.textContent;
		const text = latex.slice(0, before) + next + latex.slice(latex.length - after);
		host.view.dispatch(host.view.state.tr.replaceWith(pos + 1, pos + node.nodeSize - 1, node.type.schema.text(text)));
		syncChipPanel(anchor, next);
	}
	function step(run: () => boolean): void {
		run();
		syncChipPanel(anchor, callNow());
	}
	openChipPanel({
		anchor,
		source: call.latex.slice(call.from, call.to),
		language: 'latex',
		inline: true,
		settingsFor: () => null,
		write,
		writeSetting: write,
		jump: () => {},
		jumpToDefinition,
		view: host.view,
		undo: () => step(undoVisual),
		redo: () => step(redoVisual),
		onClose(how) {
			anchor.remove();
			if (how === 'away' || !field.isConnected) return;
			field.focus();
			const again = macroCallAgain(field, command, ordinal);
			const range = again && macroRange(field, again);
			if (range) selectInField(field, range);
		},
		footer: macroFooter(call.latex.slice(call.from, call.to), jumpToDefinition),
		caret: macroCaret(call.latex.slice(call.from, call.to))
	});
	keepPanelFocus(field, anchor);
	return true;
}

const RECLAIM_MS = 250;

/** mathlive takes the keyboard back 60 ms after its field gets the focus, which a panel opened sooner would lose */
function keepPanelFocus(field: MathfieldElement, anchor: HTMLElement): void {
	const opened = performance.now();
	function reclaim(): void {
		if (performance.now() - opened > RECLAIM_MS || !chipPanelOpenFor(anchor)) return;
		anchor.ownerDocument.querySelector<HTMLElement>('.drawn-chip-panel .cm-content')?.focus();
	}
	field.addEventListener('focusin', reclaim);
	setTimeout(() => field.removeEventListener('focusin', reclaim), RECLAIM_MS);
}
