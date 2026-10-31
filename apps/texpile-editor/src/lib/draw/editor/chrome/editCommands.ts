import { m } from '$lib/paraglide/messages';
import { canGroup, groupSelection, orderSelection, ungroupBlocker, ungroupSelection } from '../objects/arrangeCommands';
import { toggleLocked } from '../objects/lockCommands';
import type { FigureEditorState } from '../state/editorState.svelte';
import { deleteSelection, duplicateSelection } from '../state/selection/selectionCommands';
import { canPasteStyle, copyStyle, pasteStyle } from '../state/selection/selectionStyle';
import { copySelection, pasteClipboard } from './menubar/menuBarCommands';
import { redoShortcutText, shortcutText } from './menubar/shortcutText';

export type EditCommand = { value: string; label: string; shortcut?: string; disabled?: boolean } | null;

/** what the Edit menu and the right-click menu do to the selection; null is a separator */
export function selectionCommands(ed: FigureEditorState): EditCommand[] {
	const none = !ed.selection.length;
	const locked = !none && ed.selection.every((i) => ed.flags.locked.includes(i));
	return [
		{ value: 'cut', label: m.figure_cmd_cut(), shortcut: shortcutText('X'), disabled: none },
		{ value: 'copy', label: m.figure_cmd_copy(), shortcut: shortcutText('C'), disabled: none },
		{ value: 'paste', label: m.figure_cmd_paste(), shortcut: shortcutText('V') },
		{ value: 'duplicate', label: m.figure_cmd_duplicate(), shortcut: shortcutText('D'), disabled: none },
		{ value: 'delete', label: m.figure_cmd_delete(), shortcut: 'Del', disabled: none },
		null,
		{ value: 'copy-style', label: m.figure_cmd_copy_style(), shortcut: shortcutText('C', { alt: true }), disabled: none },
		{
			value: 'paste-style',
			label: m.figure_cmd_paste_style(),
			shortcut: shortcutText('V', { alt: true }),
			disabled: none || !canPasteStyle()
		},
		null,
		{ value: 'front', label: m.figure_cmd_front(), shortcut: shortcutText(']', { shift: true }), disabled: none },
		{ value: 'forward', label: m.figure_cmd_forward(), shortcut: shortcutText(']'), disabled: none },
		{ value: 'backward', label: m.figure_cmd_backward(), shortcut: shortcutText('['), disabled: none },
		{ value: 'back', label: m.figure_cmd_back(), shortcut: shortcutText('[', { shift: true }), disabled: none },
		null,
		{ value: 'group', label: m.figure_cmd_group(), shortcut: shortcutText('G'), disabled: !canGroup(ed) },
		{
			value: 'ungroup',
			label: m.figure_cmd_ungroup(),
			shortcut: shortcutText('G', { shift: true }),
			disabled: ungroupBlocker(ed) !== null
		},
		{
			value: 'lock',
			label: locked ? m.figure_cmd_unlock() : m.figure_cmd_lock(),
			shortcut: shortcutText('L', { shift: true }),
			disabled: none
		}
	];
}

export function historyCommands(): EditCommand[] {
	return [
		{ value: 'undo', label: m.figure_cmd_undo(), shortcut: shortcutText('Z') },
		{ value: 'redo', label: m.figure_cmd_redo(), shortcut: redoShortcutText() }
	];
}

export function runEditCommand(ed: FigureEditorState, value: string) {
	if (value === 'undo') ed.undo();
	else if (value === 'redo') ed.redo();
	else if (value === 'cut' || value === 'copy') void copySelection(ed, value === 'cut');
	else if (value === 'paste') void pasteClipboard(ed);
	else if (value === 'duplicate') duplicateSelection(ed);
	else if (value === 'delete') deleteSelection(ed);
	else if (value === 'select-all') ed.selectAll();
	else if (value === 'lock') toggleLocked(ed, ed.selection);
	else if (value === 'group') groupSelection(ed);
	else if (value === 'ungroup') ungroupSelection(ed);
	else if (value === 'copy-style') copyStyle(ed);
	else if (value === 'paste-style') pasteStyle(ed);
	else if (value === 'front' || value === 'forward' || value === 'backward' || value === 'back') orderSelection(ed, value);
}
