import { Plugin } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';
import { commandsForKey } from './editorKeys';

/** a ProseMirror keymap whose keys come from the manager: put it where the editor's own keymap for these sat */
export function pmCommandKeys(commands: Record<string, Command>): Plugin {
	const own = new Set(Object.keys(commands));
	return new Plugin({
		props: {
			handleKeyDown(view, e) {
				for (const id of commandsForKey(e, own)) if (commands[id](view.state, view.dispatch, view)) return true;
				return false;
			}
		}
	});
}
