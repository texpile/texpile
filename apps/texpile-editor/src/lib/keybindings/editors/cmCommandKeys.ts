import { keymap, type Command, type EditorView as CMView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { commandsForKey } from './editorKeys';

/** a CodeMirror keymap whose keys come from the manager: put it where the editor's own keymap for these sat */
export function cmCommandKeys(commands: Record<string, Command>): Extension {
	const own = new Set(Object.keys(commands));
	return keymap.of([
		{
			any(view: CMView, e: KeyboardEvent) {
				for (const id of commandsForKey(e, own)) if (commands[id](view)) return true;
				return false;
			}
		}
	]);
}
