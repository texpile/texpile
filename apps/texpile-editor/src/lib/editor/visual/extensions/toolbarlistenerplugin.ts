import { Plugin } from 'prosemirror-state';
import { editorViewStore as editorviewstore } from '$lib/stores/editorStore';

export function menuUpdatePlugin() {
	return new Plugin({
		view() {
			return {
				update: (view) => {
					// a parked editor's view updates too, when its file changes elsewhere: it is not the app's
					if (view.editable) editorviewstore.current = view;
				}
			};
		}
	});
}
