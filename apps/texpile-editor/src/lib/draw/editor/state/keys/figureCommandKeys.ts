// the figure editor's commands, on the keys the keybinding manager has for them
import { commandsForKey } from '$lib/keybindings/editors/editorKeys';
import { groupSelection, orderSelection, ungroupSelection } from '../../objects/arrangeCommands';
import { toggleLocked } from '../../objects/lockCommands';
import { copyStyle, pasteStyle } from '../selection/selectionStyle';
import { duplicateSelection } from '../selection/selectionCommands';
import type { FigureEditorState } from '../editorState.svelte';

type FigureCommands = Record<string, (editor: FigureEditorState) => void>;

/** the view's keys, which the page's own zoom would take otherwise, so they work while typing too */
export const FIGURE_VIEW_COMMANDS: FigureCommands = {
	'figure.zoomIn': (ed) => ed.viewport.zoomIn(),
	'figure.zoomOut': (ed) => ed.viewport.zoomOut(),
	'figure.zoom100': (ed) => ed.viewport.zoomToPercent(100)
};

/** also the objects list's */
export const FIGURE_ARRANGE_COMMANDS: FigureCommands = {
	'figure.bringToFront': (ed) => orderSelection(ed, 'front'),
	'figure.bringForward': (ed) => orderSelection(ed, 'forward'),
	'figure.sendBackward': (ed) => orderSelection(ed, 'backward'),
	'figure.sendToBack': (ed) => orderSelection(ed, 'back'),
	'figure.group': groupSelection,
	'figure.ungroup': ungroupSelection
};

export const FIGURE_EDIT_COMMANDS: FigureCommands = {
	'figure.undo': (ed) => ed.undo(),
	'figure.redo': (ed) => ed.redo(),
	'figure.duplicate': duplicateSelection,
	'figure.lock': (ed) => toggleLocked(ed, ed.selection),
	'figure.grid': (ed) => ed.toggleGrid(),
	'figure.selectAll': (ed) => ed.selectAll(),
	'figure.copyStyle': copyStyle,
	'figure.pasteStyle': pasteStyle,
	...FIGURE_ARRANGE_COMMANDS
};

const own = new Map<FigureCommands, Set<string>>();

export function runFigureCommandKey(e: KeyboardEvent, commands: FigureCommands, editor: FigureEditorState): boolean {
	let ids = own.get(commands);
	if (!ids) own.set(commands, (ids = new Set(Object.keys(commands))));
	const [id] = commandsForKey(e, ids);
	if (!id) return false;
	commands[id](editor);
	return true;
}
