// the commands every window has, start screen included
import { registerCommands } from './commands/commandRegistry';
import { ensureUserKeybindings, userKeybindingsAvailable } from './user/userKeybindingsFile';
import { openPreferencesAt, preferencesOpen } from '$lib/stores/dialogStore';
import { commandPalette } from '$lib/workspace/commandPalette.svelte';
import { openFileInWindow } from '$lib/workspace/openWorkspace';
import { allowTabsOutsideRoot } from '$lib/workspace/tabs.svelte';
import { samePath } from '$lib/workspace/fileSystem';

async function openKeybindingsFile(): Promise<void> {
	const path = await ensureUserKeybindings();
	if (!path) return;
	preferencesOpen.current = false;
	allowTabsOutsideRoot('keybindings', (p) => samePath(p, path));
	// in a workspace a tab; on the start screen the file on its own
	if (commandPalette.actions) commandPalette.actions.openFile(path);
	else await openFileInWindow(path);
}

export function registerKeybindingCommands(): () => void {
	return registerCommands([
		{ id: 'keybindings.open', run: () => openPreferencesAt('keybindings') },
		{ id: 'keybindings.openJson', enabled: userKeybindingsAvailable, run: openKeybindingsFile },
		{ id: 'file.preferences', run: () => (preferencesOpen.current = true) }
	]);
}
