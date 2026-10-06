// Whole-window keyboard shortcuts, plus the UI zoom they drive.
//
// UI zoom uses webContents.setZoomFactor, which scales the ENTIRE renderer (editor, sidebar,
// toolbars, panels). It is persisted in settings and also reachable from the View menu. Distinct
// from the PDF / Live preview zoom, which only scales the preview.
import { activeFilePath, activeCompare } from '$lib/workspace/workspaceStore';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { settings, updateSettings } from '$lib/settings';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { pdfFindToggle } from '$lib/stores/editorStore';
import { isMac } from '$lib/platform';
import { editorGroups } from './groups/editorGroups.svelte';

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
	/** a guest has nothing to save: its edits are already live in the shared doc */
	isGuest(): boolean;
	save(): void;
	toggleGlobalSearch(): void;
	terminalAvailable(): boolean;
	isCompiling(): boolean;
	runCompile(): void;
	stopCompile(): void;
	openPreferences(): void;
	/** does nothing in a guest's window, which cannot swap its folder out */
	openFolder(): void;
	stepDocumentHistory(direction: 'undo' | 'redo'): void;
};

/** VS Code's keys: Mod+Z undoes, Mod+Y and Mod+Shift+Z redo */
function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
	if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
	const k = e.key.toLowerCase();
	if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
	return k === 'y' && !e.shiftKey ? 'redo' : null;
}

export function createKeydownHandler(deps: ShortcutDeps): (e: KeyboardEvent) => void {
	return (e: KeyboardEvent) => {
		const mod = e.metaKey || e.ctrlKey;
		const history = historyKey(e);
		if (history) {
			// the editors and the file tree take these themselves; from anywhere else (the body, once a card's
			// Reject button has gone) they reach the open document the way the Edit menu does. Chromium's own
			// undo lands there only by chance, and its redo never does
			if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(`${TYPING_HOSTS}, [role="dialog"]`))) return;
			e.preventDefault();
			deps.stepDocumentHistory(history);
		} else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
			e.preventDefault();
			// closes the FOCUSED tab, which may be a comparison rather than the file itself. The tab
			// strip runs on activeFilePath, not on the loaded document: a file that failed to load
			// (deleted on disk) still has its tab focused while the document buffer holds no path
			const path = activeFilePath.current;
			if (path) deps.closeTab({ path, compare: activeCompare.current ?? undefined });
			// with no tab left, the window, as Cmd+W does in every other Mac app
			else if (isMac) void nativeBridge()?.windowClose?.();
		} else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
			// Ctrl+O in the terminal is the shell's
			if (e.target instanceof Element && e.target.closest('.xterm')) return;
			e.preventDefault();
			deps.openFolder();
		} else if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
			e.preventDefault();
			deps.reopenTab();
		} else if (mod && !e.shiftKey && !e.altKey && e.key === '\\') {
			e.preventDefault();
			editorGroups.splitRight();
		} else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
			e.preventDefault();
			// VS Code's: the editor group at that place
			editorGroups.focusAt(Number(e.key) - 1);
		} else if (mod && !e.shiftKey && !e.altKey && e.key === ',') {
			// the desktop convention; macOS also has it as a native accelerator (windowChrome.ts)
			e.preventDefault();
			deps.openPreferences();
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
		} else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && pdfFindToggle.current) {
			// a .pdf tab: the editors bind Ctrl+F themselves, and on Windows and Linux there is no native
			// menu to carry the accelerator, so the tab's find bar is opened from here. Not while typing
			// somewhere else: the terminal, a rename box, the sidebar search and the bar itself keep the key
			if (e.target instanceof Element && e.target.closest(TYPING_HOSTS)) return;
			e.preventDefault();
			pdfFindToggle.current();
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

/** Keys that must reach the workspace before an editor sees them. Ctrl+Shift+G is VS Code's Source
 *  Control, and the source editor would take it as find-previous (still on Shift+F3 and Shift+Enter).
 *  Ctrl on macOS too, as in VS Code: Cmd+Shift+G stays find-previous there. */
export function createCaptureKeydownHandler(deps: { openSourceControl(): void }): (e: KeyboardEvent) => void {
	return (e: KeyboardEvent) => {
		if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'g') {
			e.preventDefault();
			e.stopPropagation();
			deps.openSourceControl();
		}
	};
}
