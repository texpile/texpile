// Open flags for dialogs that more than one place needs to raise.
//
// Preferences used to be local state inside WorkspaceMenuBar, which is fine while the File menu is
// the only way in. The command palette is a second way in, and it has no path to a child
// component's state - so the flag moves out here, the same shape as updateModalOpen and
// whatsNewOpen. Not persisted; this is transient UI state, not a setting.
import { box } from '$lib/runes/box.svelte';

export const preferencesOpen = box(false);

const REOPEN_PREFERENCES = 'texpile:reopen-preferences';

export function markPreferencesReopen(): void {
	try {
		sessionStorage.setItem(REOPEN_PREFERENCES, '1');
	} catch {
		return;
	}
}

export function takePreferencesReopen(): boolean {
	try {
		const set = sessionStorage.getItem(REOPEN_PREFERENCES) === '1';
		sessionStorage.removeItem(REOPEN_PREFERENCES);
		return set;
	} catch {
		return false;
	}
}

/**
 * The tab Preferences should land on, for the places that open it to answer a specific question -
 * the compile modal sending someone to Toolchain because their compiler is not installed.
 *
 * A one-shot: PreferencesDialog reads it, switches, and clears it, so the NEXT plain open lands
 * where the reader last was rather than being dragged back here.
 */
export const preferencesTab = box<string | null>(null);

/** "your compiler is not installed" -> the panel that lists them */
export function openToolchainPrefs(): void {
	openPreferencesAt('toolchain');
}

export function openPreferencesAt(tab: string): void {
	preferencesTab.current = tab;
	preferencesOpen.current = true;
}
