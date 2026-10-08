// the one panel a drawn chip opens under itself, mounted the first time one opens
import { mount, unmount, type Component } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import DrawnChipPanel from './DrawnChipPanel.svelte';

export type ChipSettingsProps = {
	source: string;
	write(next: string): void;
	/** closes the panel from the keyboard's way; a chip rewritten as text is read again then */
	close(): void;
	jump(label: string): void;
	jumpToDefinition(name: string): void;
	view: EditorView;
};
export type ChipSettings = Component<ChipSettingsProps>;

/** Escape and Enter close from the keyboard and leave the caret after the chip; away is a click somewhere else */
export type ChipPanelClose = 'escape' | 'enter' | 'away';

export type ChipPanelRequest = {
	anchor: HTMLElement;
	source: string;
	language: 'latex' | 'typst';
	/** an inline chip's LaTeX stays on one line */
	inline: boolean;
	settingsFor(source: string): ChipSettings | null;
	/** from the LaTeX field, as typed */
	write(next: string): void;
	/** from a setting, kept from running into the text after the chip */
	writeSetting(next: string): void;
	jump(label: string): void;
	jumpToDefinition(name: string): void;
	view: EditorView;
	undo(): void;
	redo(): void;
	onClose(how: ChipPanelClose): void;
};

export const chipPanel = $state<{ request: ChipPanelRequest | null; source: string }>({ request: null, source: '' });

/** the document the panel is mounted in, and the way out of it: an editor in a window of its own opens it there */
let mounted: { doc: Document; app: ReturnType<typeof mount> } | null = null;

export function openChipPanel(request: ChipPanelRequest): void {
	closeChipPanel('away');
	chipPanel.source = request.source;
	chipPanel.request = request;
	const doc = request.anchor.ownerDocument;
	if (mounted?.doc === doc) return;
	if (mounted) {
		try {
			void unmount(mounted.app);
		} catch {
			/* its window has gone */
		}
	}
	mounted = { doc, app: mount(DrawnChipPanel, { target: doc.body }) };
}

export function closeChipPanel(how: ChipPanelClose): void {
	const { request } = chipPanel;
	if (!request) return;
	chipPanel.request = null;
	request.onClose(how);
}

/** the chip went away under its panel (deleted, undone, the editor closed) */
export function dismissChipPanel(anchor: HTMLElement): void {
	if (chipPanel.request?.anchor === anchor) chipPanel.request = null;
}

export function chipPanelOpenFor(anchor: HTMLElement): boolean {
	return chipPanel.request?.anchor === anchor;
}

/** the chip's source changed under the panel (an undo, a setting) */
export function syncChipPanel(anchor: HTMLElement, source: string): void {
	if (chipPanel.request?.anchor === anchor) chipPanel.source = source;
}
