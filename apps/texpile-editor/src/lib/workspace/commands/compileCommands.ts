import type { CommandImpl } from '$lib/keybindings/commands/commandRegistry';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { m } from '$lib/paraglide/messages';

export function compileCommands(a: PaletteActions): CommandImpl[] {
	return [
		{ id: 'compile.run', enabled: () => a.compileAvailable() && !a.isCompiling(), run: () => a.runCompile() },
		{ id: 'compile.stop', enabled: () => a.compileAvailable() && a.isCompiling(), run: () => a.stopCompile() },
		{ id: 'compile.configure', enabled: () => a.compileAvailable(), run: () => a.openCompileModal() },
		{
			id: 'terminal.toggle',
			enabled: () => a.terminalAvailable(),
			title: () => (a.terminalVisible() ? m.palette_hide_terminal() : m.menubar_show_terminal()),
			run: () => a.toggleTerminal()
		},
		{ id: 'terminal.new', enabled: () => a.terminalAvailable(), run: () => a.newTerminal() }
	];
}
