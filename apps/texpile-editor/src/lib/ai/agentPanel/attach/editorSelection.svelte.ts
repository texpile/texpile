// the reader's selection in the open file, read again as it changes, so the box shows the lines that will go
import { untrack } from 'svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { SELECTION_EVENT } from '$lib/editor/canvas';
import { agentHost } from '../agentHost.svelte';
import { selectedLines } from './attached';
import type { SelectedLines } from '../agentPanel.types';

// a drag fires the page's selectionchange at every step; the lines are read once it rests
const SETTLE_MS = 150;
const CHANGE_EVENTS = ['selectionchange', SELECTION_EVENT];

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
		// a text box's own caret moves with every key typed there, and the editor's selection cannot move meanwhile;
		// the visual editor's own input textarea is not such a box
		function onChange(): void {
			const at = document.activeElement;
			const textBox = (at instanceof HTMLTextAreaElement || at instanceof HTMLInputElement) && !at.closest('[data-canvas-input]');
			if (!textBox) later();
		}
		untrack(() => this.read());
		// the canvas editor's selection is no DOM selection: it sends its own event
		for (const type of CHANGE_EVENTS) document.addEventListener(type, onChange);
		return () => {
			later.cancel();
			for (const type of CHANGE_EVENTS) document.removeEventListener(type, onChange);
		};
	}
}
