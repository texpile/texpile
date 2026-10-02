// the reader's selection in the open file, read again as it changes, so the box shows the lines that will go
import { untrack } from 'svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { agentHost } from '../agentHost.svelte';
import { selectedLines } from './attached';
import type { SelectedLines } from '../agentPanel.types';

// a drag fires the page's selectionchange at every step; the lines are read once it rests
const SETTLE_MS = 150;

export class EditorSelection {
	current = $state<{ path: string; lines: SelectedLines } | null>(null);

	read(): void {
		const path = activeFilePath.current;
		const span = agentHost.current?.selection();
		this.current = path && span ? { path, lines: selectedLines(span.text, span.from, span.to) } : null;
	}

	/** reads it now and after each change of selection in the editor; the returned function stops */
	watch(): () => void {
		const later = trailingDebounce<void>(SETTLE_MS, () => this.read());
		// a text box's own caret moves with every key typed there, and the editor's selection cannot move meanwhile
		function onChange(): void {
			const at = document.activeElement;
			if (!(at instanceof HTMLTextAreaElement || at instanceof HTMLInputElement)) later();
		}
		untrack(() => this.read());
		document.addEventListener('selectionchange', onChange);
		return () => {
			later.cancel();
			document.removeEventListener('selectionchange', onChange);
		};
	}
}
