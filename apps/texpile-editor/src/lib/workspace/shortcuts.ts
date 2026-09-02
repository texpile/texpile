// Whole-window keyboard shortcuts, plus the UI zoom they drive.
//
// UI zoom uses webContents.setZoomFactor, which scales the ENTIRE renderer (editor, sidebar,
// toolbars, panels). It is persisted in settings and also reachable from the View menu. Distinct
// from the PDF / Live preview zoom, which only scales the preview.
import { activeFilePath, activeCompare } from '$lib/workspace/workspaceStore';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { settings, updateSettings } from '$lib/settings';
import { nativeBridge } from '$lib/workspace/fileSystem';

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
	getLoadedPath(): string | null;
	closeTab(tab: Tab): void;
	/** a guest has nothing to save: its edits are already live in the shared doc */
	isGuest(): boolean;
	save(): void;
	toggleGlobalSearch(): void;
	terminalAvailable(): boolean;
	isCompiling(): boolean;
	runCompile(): void;
	stopCompile(): void;
};

export function createKeydownHandler(deps: ShortcutDeps): (e: KeyboardEvent) => void {
	return (e: KeyboardEvent) => {
		const mod = e.metaKey || e.ctrlKey;
		if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
			e.preventDefault();
			// closes the FOCUSED tab, which may be a comparison rather than the file itself
			const path = deps.getLoadedPath();
			if (path) deps.closeTab({ path, compare: activeCompare.current ?? undefined });
		} else if (e.ctrlKey && e.key === 'Tab') {
			e.preventDefault();
			// cycle by tab KEY, so a file and a comparison of it are two stops rather than one
			const p = activeFilePath.current;
			const current = p ? tabKey({ path: p, compare: activeCompare.current ?? undefined }) : null;
			const next = tabs.cycle(current, e.shiftKey ? -1 : 1);
			if (next) {
				activeCompare.current = next.compare ?? null;
				activeFilePath.current = next.path;
			}
		} else if (mod && e.key.toLowerCase() === 's') {
			e.preventDefault(); // block the browser save dialog
			if (!deps.isGuest()) deps.save();
		} else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			deps.toggleGlobalSearch();
		} else if (mod && (e.key === '=' || e.key === '+')) {
			e.preventDefault(); // '=' is the unshifted '+' key, so this is Ctrl/Cmd+Plus
			uiZoomIn();
		} else if (mod && e.key === '-') {
			e.preventDefault();
			uiZoomOut();
		} else if (mod && e.key === '0') {
			e.preventDefault();
			uiZoomReset();
		} else if (mod && e.altKey && e.key === 'Enter' && deps.terminalAvailable()) {
			// was ctrl/cmd+alt+b (LaTeX Workshop's default build chord), but macOS treats option+b
			// as a dead key for a special character, so e.key never reliably comes through as "b"
			// there. Swapped the letter to Enter (not a dead-key character on macOS) rather than
			// dropping Alt entirely - bare ctrl/cmd+enter is already taken by the Source Control
			// panel's commit shortcut (SourceControlPanel.svelte).
			e.preventDefault();
			if (deps.isCompiling()) deps.stopCompile();
			else deps.runCompile();
		}
	};
}
