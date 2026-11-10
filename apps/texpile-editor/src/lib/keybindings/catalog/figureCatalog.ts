import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.keybindings_figure_category();
}

function figureCommand(id: string, title: () => string): CommandInfo {
	return { id: `figure.${id}`, title, category, palette: false };
}

// the figure tab's own keys, run by the figure editor
export const FIGURE_COMMANDS: CommandInfo[] = [
	figureCommand('undo', () => m.figure_cmd_undo()),
	figureCommand('redo', () => m.figure_cmd_redo()),
	figureCommand('duplicate', () => m.figure_cmd_duplicate()),
	figureCommand('selectAll', () => m.figure_cmd_select_all()),
	figureCommand('lock', () => m.figure_cmd_lock()),
	figureCommand('grid', () => m.figure_shortcut_grid()),
	figureCommand('copyStyle', () => m.figure_cmd_copy_style()),
	figureCommand('pasteStyle', () => m.figure_cmd_paste_style()),
	figureCommand('bringToFront', () => m.figure_cmd_front()),
	figureCommand('bringForward', () => m.figure_cmd_forward()),
	figureCommand('sendBackward', () => m.figure_cmd_backward()),
	figureCommand('sendToBack', () => m.figure_cmd_back()),
	figureCommand('group', () => m.figure_cmd_group()),
	figureCommand('ungroup', () => m.figure_cmd_ungroup()),
	figureCommand('zoomIn', () => m.figure_zoom_in()),
	figureCommand('zoomOut', () => m.figure_zoom_out()),
	figureCommand('zoom100', () => m.figure_shortcut_zoom_100())
];
