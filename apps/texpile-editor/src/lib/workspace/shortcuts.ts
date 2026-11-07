// UI zoom, and what the workspace's window commands need from it (workspace/commands/windowCommands.ts).
//
// UI zoom uses webContents.setZoomFactor, which scales the ENTIRE renderer (editor, sidebar,
// toolbars, panels). It is persisted in settings and also reachable from the View menu. Distinct
// from the PDF / Live preview zoom, which only scales the preview.
import type { Tab } from '$lib/workspace/tabs.svelte';
import { settings, updateSettings } from '$lib/settings';
import { nativeBridge } from '$lib/workspace/fileSystem';

/** where a keystroke is typing, not a command */
export const TYPING_HOSTS = 'input, textarea, [contenteditable="true"], .xterm';

const UI_ZOOM_MIN = 0.5;
const UI_ZOOM_MAX = 2.5;
export const UI_ZOOM_STEP = 0.1;

export function setUiZoom(factor: number): void {
	const f = Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Math.round(factor * 100) / 100));
	nativeBridge()?.setZoomFactor?.(f);
	updateSettings({ uiZoom: f });
}
export function uiZoomIn() {
	return setUiZoom((settings.current.uiZoom ?? 1) + UI_ZOOM_STEP);
}
export function uiZoomOut() {
	return setUiZoom((settings.current.uiZoom ?? 1) - UI_ZOOM_STEP);
}
export function uiZoomReset() {
	return setUiZoom(1);
}

export type ShortcutDeps = {
	closeTab(tab: Tab): void;
	reopenTab(): void;
	toggleGlobalSearch(): void;
	stepDocumentHistory(direction: 'undo' | 'redo'): void;
};
