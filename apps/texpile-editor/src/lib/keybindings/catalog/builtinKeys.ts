// keys the editors' libraries bind themselves: listed in the shortcuts table so they can be found, and kept as they are
import { m } from '$lib/paraglide/messages';
import { parseKeys, type KeySequence } from '../keys/keyChord';
import type { KeyPlatform } from '../resolver/keybindingRules';

export type BuiltinKey = { id: string; title(): string; keys: string[]; mac?: string[] };

export function builtinCategory(): string {
	return m.menubar_shortcut_group_source_editor();
}

export const BUILTIN_KEYS: BuiltinKey[] = [
	{ id: 'suggest', title: () => m.menubar_shortcut_open_suggestions(), keys: ['ctrl+space'] },
	{ id: 'mathPreview', title: () => m.menubar_shortcut_hide_math_preview(), keys: ['escape'] },
	{ id: 'fold', title: () => m.menubar_shortcut_fold(), keys: ['ctrl+shift+[', 'ctrl+shift+]'], mac: ['cmd+alt+[', 'cmd+alt+]'] },
	{ id: 'foldAll', title: () => m.menubar_shortcut_fold_all(), keys: ['ctrl+alt+[', 'ctrl+alt+]'] },
	{ id: 'comment', title: () => m.keybindings_builtin_comment(), keys: ['mod+/'] },
	{ id: 'selectNext', title: () => m.keybindings_builtin_select_next(), keys: ['mod+d'] },
	{ id: 'cursorAbove', title: () => m.keybindings_builtin_cursor_above(), keys: ['mod+alt+up'] },
	{ id: 'cursorBelow', title: () => m.keybindings_builtin_cursor_below(), keys: ['mod+alt+down'] },
	{ id: 'moveLineUp', title: () => m.keybindings_builtin_move_up(), keys: ['alt+up'] },
	{ id: 'moveLineDown', title: () => m.keybindings_builtin_move_down(), keys: ['alt+down'] },
	{ id: 'copyLineUp', title: () => m.keybindings_builtin_copy_up(), keys: ['shift+alt+up'] },
	{ id: 'copyLineDown', title: () => m.keybindings_builtin_copy_down(), keys: ['shift+alt+down'] },
	{ id: 'deleteLine', title: () => m.keybindings_builtin_delete_line(), keys: ['mod+shift+k'] },
	{ id: 'goToLine', title: () => m.keybindings_builtin_go_to_line(), keys: ['mod+alt+g'] },
	{ id: 'findNext', title: () => m.keybindings_builtin_find_next(), keys: ['f3', 'shift+f3'] },
	{ id: 'blankLine', title: () => m.keybindings_builtin_blank_line(), keys: ['mod+enter'] },
	// tinymist's, through the language server client
	{ id: 'typstFormat', title: () => m.keybindings_builtin_typst_format(), keys: ['shift+alt+f'] },
	{ id: 'typstReferences', title: () => m.keybindings_builtin_typst_references(), keys: ['shift+f12'] }
];

/** each key of the entry as the platform has it */
export function builtinKeys(entry: BuiltinKey, platform: KeyPlatform): KeySequence[] {
	const texts = platform === 'mac' ? (entry.mac ?? entry.keys) : entry.keys;
	return texts.map((t) => parseKeys(t, platform === 'mac')).filter((k): k is KeySequence => !!k);
}
