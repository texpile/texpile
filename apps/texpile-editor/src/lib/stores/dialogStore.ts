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

/** the one deep link there is: "your compiler is not installed" -> the panel that lists them. */
export function openToolchainPrefs(): void {
	preferencesTab.current = 'toolchain';
	preferencesOpen.current = true;
}

/**
 * The dictionary and the shortcut sheet, for the same reason and then one more.
 *
 * These were local state in WorkspaceMenuBar, which also MOUNTED the dialogs - fine while the host
 * menu bar is the only way in. But a guest session renders no menu bar at all, so for a guest the
 * dialogs did not exist, and the palette's Preferences command set a flag nothing was listening to.
 * The flags live here and WindowDialogs mounts the dialogs for both.
 */
export const dictionaryOpen = box(false);
export const shortcutsOpen = box(false);
