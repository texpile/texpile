import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.palette_group_editor();
}

// keys of the editor with the focus, which the palette has no use for
export const EDITING_COMMANDS: CommandInfo[] = [
	{ id: 'editor.find', title: () => m.menubar_shortcut_find_in_document(), category, palette: false },
	{ id: 'editor.pasteWithoutFormatting', title: () => m.ctxmenu_paste_without_formatting(), category, palette: false },
	{ id: 'editor.goToDefinition', title: () => m.drawn_chip_macro_go_to(), category, palette: false },
	{ id: 'editor.argumentHints', title: () => m.menubar_shortcut_argument_hints(), category, palette: false },
	{ id: 'editor.quickFix', title: () => m.menubar_shortcut_quick_fix(), category, palette: false },
	{ id: 'editor.nextSpellingProblem', title: () => m.keybindings_cmd_next_problem(), category, palette: false },
	{ id: 'editor.previousSpellingProblem', title: () => m.keybindings_cmd_previous_problem(), category, palette: false }
];
