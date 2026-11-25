// keeps the visual editor's find counts in step with the editor and draws its matches
import { Plugin } from 'prosemirror-state';
import { visualFind } from './visualFind.svelte';

export function visualFindPlugin(): Plugin {
	return new Plugin({
		view: () => ({
			update(view) {
				visualFind.viewUpdated(view);
			}
		}),
		props: {
			decorations: (state) => visualFind.decorations(state)
		}
	});
}
