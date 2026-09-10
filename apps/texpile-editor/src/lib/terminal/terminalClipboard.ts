// Copy and paste for the shell, the way terminals on Windows and Linux do it: Ctrl+Shift+C copies
// the selection (plain Ctrl+C stays the interrupt), Ctrl+Shift+V pastes, right-click copies a
// selection and pastes without one. Cmd+C/V on macOS already work through the browser's own events.
import type { Terminal } from '@xterm/xterm';

export function attachTerminalClipboard(term: Terminal, host: HTMLElement): () => void {
	term.attachCustomKeyEventHandler((ev) => {
		if (ev.type !== 'keydown' || !ev.ctrlKey || !ev.shiftKey || ev.altKey || ev.metaKey) return true;
		const key = ev.key.toLowerCase();
		if (key !== 'c' && key !== 'v') return true;
		ev.preventDefault();
		if (key === 'c') copySelection(term);
		else void pasteFromClipboard(term);
		return false;
	});
	function onContextMenu(ev: MouseEvent) {
		ev.preventDefault();
		if (term.hasSelection()) copySelection(term);
		else void pasteFromClipboard(term);
	}
	host.addEventListener('contextmenu', onContextMenu);
	return () => host.removeEventListener('contextmenu', onContextMenu);
}

function copySelection(term: Terminal) {
	const text = term.getSelection();
	if (!text) return;
	void navigator.clipboard.writeText(text).catch(() => {});
	term.clearSelection();
}

async function pasteFromClipboard(term: Terminal) {
	try {
		const text = await navigator.clipboard.readText();
		if (text) term.paste(text);
	} catch {
		/* clipboard empty or unreadable */
	}
	term.focus();
}
