import { Play, Settings, Square, Terminal, TerminalSquare } from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.palette_group_compile();
}

export const COMPILE_COMMANDS: CommandInfo[] = [
	{ id: 'compile.run', title: () => m.menubar_terminal_compile(), category, palette: { keywords: 'build make pdf latex run', icon: Play } },
	{ id: 'compile.stop', title: () => m.palette_stop_compile(), category, palette: { keywords: 'cancel abort kill build', icon: Square } },
	{
		id: 'compile.configure',
		title: () => m.menubar_configure_compile_command(),
		category,
		palette: { keywords: 'command latexmk engine settings', icon: Settings }
	},
	{
		id: 'terminal.toggle',
		title: () => m.keybindings_cmd_toggle_terminal(),
		category,
		palette: { keywords: 'shell console panel dock', icon: Terminal }
	},
	{ id: 'terminal.new', title: () => m.menubar_new_terminal(), category, palette: { keywords: 'shell console', icon: TerminalSquare } }
];
