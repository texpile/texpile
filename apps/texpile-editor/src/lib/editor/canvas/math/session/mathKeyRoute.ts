// a key in a formula, in the order the DOM editor's listeners ran (13.7): macro calls, history, edges, the hotfixes and
// math search, the keys that leave (A6), Shift+Enter, MathLive, then Backspace at the start
import { mathfieldContext } from 'mathlive';
import { isMac } from '$lib/platform';
import { historyKeyOf, redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';
import { completeWithPlaceholder, quoteSwitchesText } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';
import { mathSearchKey } from '$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearchKeys';
import { closeContextMenu, contextMenuOpen } from '$lib/menus/contextMenu.svelte';
import type { CanvasMathSession } from './mathSession';
import { anchorsOf } from './mathAnchors';
import { macroCallKey } from './mathMacroKeys';

type KeyRouting = 'handled' | 'pass';

function plain(event: KeyboardEvent): boolean {
	return !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/** MathLive's suggestion list of LaTeX commands or Typst names */
export function suggestionsShowing(doc: Document = document): boolean {
	return doc.getElementById('mathlive-suggestion-popover')?.classList.contains('is-visible') ?? false;
}

/** A6: Escape leaves after the math menu, LaTeX entry and the popover took theirs; Enter leaves one row and adds one to several */
export function leaveKey(session: CanvasMathSession, event: KeyboardEvent): boolean {
	if (!plain(event) || (event.key !== 'Escape' && event.key !== 'Enter')) return false;
	const { field } = session;
	if (event.key === 'Escape') {
		// the math menu (Alt+Space, a right click) keeps the keys while it shows, as the DOM field's did
		if (contextMenuOpen()) {
			closeContextMenu();
			return true;
		}
		// LaTeX entry takes it as the DOM field did: the typed command is accepted and selected, the list closes
		if (field.mode === 'latex') return false;
		if (field.closeSuggestions()) return true;
		session.exit.leaveAfter();
		return true;
	}
	if (field.mode === 'latex' || mathfieldContext(field).array?.multiline) return false;
	session.exit.leaveAfter();
	return true;
}

/** Ctrl+Left or Ctrl+Right (Alt on macOS) at an edge leaves; Shift+Left or Shift+Right at an inline formula's edge selects it */
function edgeKey(session: CanvasMathSession, event: KeyboardEvent): boolean {
	const { field } = session;
	const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
	const word = isMac ? event.altKey : event.ctrlKey;
	if (!dir || event.metaKey || (!word && !event.shiftKey) || field.position !== (dir > 0 ? field.lastOffset : 0)) return false;
	if (!field.selectionIsCollapsed && !word) return false;
	if (event.shiftKey) {
		if (!session.node.isInline) return false;
		session.exit.selectOut(dir);
	} else session.exit.moveOut(dir > 0 ? 'forward' : 'backward');
	return true;
}

/** A8: the file's history steps; the session stays while the step touched only its formula */
function stepHistory(session: CanvasMathSession, step: 'undo' | 'redo'): void {
	session.holdThroughHistory(() => (step === 'undo' ? undoVisual() : redoVisual()));
}

export function routeMathKey(session: CanvasMathSession, event: KeyboardEvent): KeyRouting {
	const { field } = session;
	if (macroCallKey(session, event)) return 'handled';
	const step = historyKeyOf(event);
	if (step) {
		stepHistory(session, step);
		return 'handled';
	}
	if (edgeKey(session, event)) return 'handled';
	const anchors = anchorsOf(session);
	if (completeWithPlaceholder(field, event) || quoteSwitchesText(field, event)) return 'handled';
	if (mathSearchKey(event, field, session.display, () => anchors.searchPlace())) return 'handled';
	if (leaveKey(session, event)) return 'handled';
	if (event.key === ' ' && event.altKey && !event.ctrlKey && !event.metaKey) {
		// Alt+Shift+Space opened MathLive's keyboard, which Texpile does not show (D24)
		if (!event.shiftKey) anchors.openMenu();
		return 'handled';
	}
	if (event.key === 'Enter' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && session.display) {
		session.exit.newFormulaBelow();
		return 'handled';
	}
	const vertical = session.aimVertically(event);
	const routing = session.exit.handleKey(event, () => field.onKeystroke(event)) ? 'pass' : 'handled';
	if (vertical) session.keepGoalHere();
	// after MathLive, as the DOM field's bubbling listener ran: a Backspace that left the caret at the start arms or leaves
	if (event.key === 'Backspace' && plain(event) && !session.isOver && session.exit.backspaceAtStart()) return 'handled';
	return routing;
}
