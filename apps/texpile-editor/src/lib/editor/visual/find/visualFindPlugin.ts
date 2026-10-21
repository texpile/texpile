// keeps the visual editor's find matches and highlights in step with the editor
import { Plugin } from 'prosemirror-state';
import { visualFind } from './visualFind.svelte';

export function visualFindPlugin(): Plugin {
	return new Plugin({
		view: () => ({
			update(view, prev) {
				visualFind.viewUpdated(view, view.state.doc !== prev.doc);
			}
		})
	});
}
