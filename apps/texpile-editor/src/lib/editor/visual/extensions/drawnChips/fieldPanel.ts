import type { EditorView } from 'prosemirror-view';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { openChipPanel, type ChipPanelClose } from './chipPanel.svelte';

export type FieldPanelRequest = {
	anchor: HTMLElement;
	source: string;
	view: EditorView;
	write(next: string): void;
	onClose(how: ChipPanelClose): void;
};

export function openFieldPanel(request: FieldPanelRequest): void {
	openChipPanel({
		...request,
		language: 'latex',
		inline: true,
		settingsFor: () => null,
		writeSetting: request.write,
		jump: () => {},
		jumpToDefinition: () => {},
		undo: () => undoVisual(),
		redo: () => redoVisual()
	});
}
