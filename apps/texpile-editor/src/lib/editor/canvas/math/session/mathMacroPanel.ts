// the chip panel on one macro call in a formula: it rewrites that call's bytes only (T11)
import { openChipPanel, syncChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { macroJumpOf } from '$lib/editor/visual/extensions/mathlivebridge/macroArgs/macroJump';
import { ownMacroDefinition } from '$lib/languages/latex/visual/core/own/ownMacroFace.svelte';
import { ownMacroCallsIn } from '$lib/languages/latex/visual/core/own/ownMacroCall';
import { macroCaret, macroFooter } from '$lib/languages/latex/visual/core/own/macroFooter';
import type { CanvasMathSession } from './mathSession';
import { macroCallRange } from './mathMacroKeys';

/** the panel hangs from an element over the call, in the editor's own scrolling content */
function anchorOver(session: CanvasMathSession, rect: DOMRect): HTMLElement {
	const { dom } = session.view;
	const anchor = dom.ownerDocument.createElement('span');
	anchor.className = 'math-macro-anchor';
	const origin = dom.getBoundingClientRect();
	Object.assign(anchor.style, {
		position: 'absolute',
		pointerEvents: 'none',
		left: `${rect.left - origin.left}px`,
		top: `${rect.top - origin.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`
	});
	dom.appendChild(anchor);
	return anchor;
}

export function openMathMacroPanel(session: CanvasMathSession, index: number): boolean {
	const { view, field } = session;
	const call = session.layout.macroCalls[index];
	const rect = session.macroCallClientRect(index);
	const command = call?.command.slice(1) ?? '';
	const definition = ownMacroDefinition(command);
	if (!call || !rect || !definition || !view.editable || field.readOnly) return false;
	const ordinal = session.layout.macroCalls.slice(0, index).filter((other) => other.command === call.command).length;
	const latex = session.node.textContent;
	const at = ownMacroCallsIn(latex, command, ownMacroDefinition)[ordinal];
	if (!at) return false;
	const anchor = anchorOver(session, rect);
	function jumpToDefinition(name: string): void {
		macroJumpOf(view.state)(name);
	}
	// the call's place by the text around it, not found again: a half typed call stops reading as one
	const before = at.from;
	const after = latex.length - at.to;
	function callNow(): string {
		const text = session.node.textContent;
		return text.slice(before, text.length - after);
	}
	function write(next: string): void {
		const { node, pos } = session;
		const text = node.textContent;
		const written = text.slice(0, before) + next + text.slice(text.length - after);
		view.dispatch(view.state.tr.replaceWith(pos + 1, pos + node.nodeSize - 1, node.type.schema.text(written)));
		syncChipPanel(anchor, next);
	}
	function step(run: () => boolean): void {
		run();
		syncChipPanel(anchor, callNow());
	}
	const source = latex.slice(at.from, at.to);
	openChipPanel({
		anchor,
		source,
		language: 'latex',
		inline: true,
		settingsFor: () => null,
		write,
		writeSetting: write,
		jump: () => {},
		jumpToDefinition,
		view,
		undo: () => step(undoVisual),
		redo: () => step(redoVisual),
		onClose(how) {
			anchor.remove();
			if (how === 'away' || session.isOver) return;
			view.focus();
			const again = session.layout.macroCalls.findIndex(
				(other, i) =>
					other.command === call.command &&
					session.layout.macroCalls.slice(0, i).filter((o) => o.command === call.command).length === ordinal
			);
			const range = again >= 0 ? macroCallRange(session, again) : null;
			if (range) field.selection = { ranges: [range] };
		},
		footer: macroFooter(source, jumpToDefinition),
		caret: macroCaret(source)
	});
	return true;
}
