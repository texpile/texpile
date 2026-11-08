// The workspace's commands, for the keys, the menus and the palette, registered while it is open
import { registerCommands } from '$lib/keybindings/commands/commandRegistry';
import { setPaletteActions, type PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { ShortcutDeps } from '$lib/workspace/shortcuts';
import { windowCommands } from '$lib/workspace/commands/windowCommands';
import { compileCommands } from '$lib/workspace/commands/compileCommands';
import { viewCommands } from '$lib/workspace/commands/viewCommands';
import { editorCommands } from '$lib/workspace/commands/editorCommands';
import { fileCommands } from '$lib/workspace/commands/fileCommands';

/** called during component init: it runs effects */
export function bindWorkspaceShortcuts(deps: ShortcutDeps): void {
	$effect(() => registerCommands(windowCommands(deps)));
}

/** cleared on destroy, so a keystroke after the workspace closed is inert */
export function bindPaletteCommands(actions: PaletteActions): () => void {
	setPaletteActions(actions);
	const unregister = registerCommands([
		...compileCommands(actions),
		...viewCommands(actions),
		...editorCommands(actions),
		...fileCommands(actions)
	]);
	return () => {
		unregister();
		setPaletteActions(null);
	};
}
