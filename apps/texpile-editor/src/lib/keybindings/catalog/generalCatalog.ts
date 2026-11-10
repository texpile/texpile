import { Keyboard, Palette } from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.menubar_shortcut_group_general();
}
const keyless = false as const;

export const GENERAL_COMMANDS: CommandInfo[] = [
	{
		id: 'keybindings.open',
		title: () => m.menubar_keyboard_shortcuts(),
		category,
		palette: { keywords: 'keybindings keys hotkeys shortcuts rebind preferences', icon: Keyboard }
	},
	{
		id: 'keybindings.openJson',
		title: () => m.keybindings_cmd_open_json(),
		category,
		palette: { keywords: 'keybindings json keys hotkeys shortcuts rebind file', icon: Keyboard }
	},
	{ id: 'palette.open', title: () => m.palette_open(), category, palette: keyless },
	{ id: 'palette.goToFile', title: () => m.palette_group_go(), category, palette: keyless },
	{ id: 'window.new', title: () => m.menubar_new_window(), category, palette: keyless },
	{ id: 'tab.close', title: () => m.keybindings_cmd_close_tab(), category, palette: keyless },
	{ id: 'tab.reopen', title: () => m.menubar_shortcut_reopen_tab(), category, palette: keyless },
	{ id: 'tab.next', title: () => m.keybindings_cmd_next_tab(), category, palette: keyless },
	{ id: 'tab.previous', title: () => m.keybindings_cmd_previous_tab(), category, palette: keyless },
	...[1, 2, 3, 4].map((n): CommandInfo => ({
		id: `view.focusEditor${n}`,
		title: () => m.keybindings_cmd_focus_editor({ n }),
		category,
		palette: keyless
	})),
	{ id: 'edit.undo', title: () => m.menubar_undo(), category, palette: keyless },
	{ id: 'edit.redo', title: () => m.menubar_redo(), category, palette: keyless },
	// the way back from a theme that hides the window's own controls
	{
		id: 'view.defaultTheme',
		title: () => m.theme_cmd_use_default(),
		category,
		palette: { keywords: 'theme reset default appearance colors css custom', icon: Palette }
	},
	{ id: 'view.zoomIn', title: () => m.menubar_shortcut_zoom_in_interface(), category, palette: keyless },
	{ id: 'view.zoomOut', title: () => m.menubar_shortcut_zoom_out_interface(), category, palette: keyless },
	{ id: 'view.zoomReset', title: () => m.menubar_shortcut_reset_interface_zoom(), category, palette: keyless },
	{ id: 'pdf.find', title: () => m.keybindings_cmd_find_in_pdf(), category, palette: keyless },
	...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): CommandInfo => ({
		id: `start.openRecent${n}`,
		title: () => m.keybindings_cmd_open_recent({ n }),
		category,
		palette: keyless
	}))
];
