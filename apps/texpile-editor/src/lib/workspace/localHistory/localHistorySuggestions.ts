// a Local History restore's hands on the suggestions: the dialog names files by their full paths, the comment log by
// their paths in the open folder, and outside one there is no log to keep
import { relativeTo } from '$lib/comments/store.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import type { SuggestionsController } from '../suggestions/suggestionsController';
import type { LocalHistoryDeps } from './localHistoryActions.svelte';

type SuggestionDeps = Pick<LocalHistoryDeps, 'suggestionsDropped' | 'restoreSuggestions' | 'adoptClosed'>;

export function localHistorySuggestions(suggestions: SuggestionsController): SuggestionDeps {
	function inFolder(path: string): string | null {
		const root = workspaceRoot.current;
		return root ? relativeTo(root, path) : null;
	}
	return {
		suggestionsDropped: async (path, before, after) => {
			const file = inFolder(path);
			return file ? suggestions.droppedBy(file, before, after) : 0;
		},
		restoreSuggestions: async (path, before, after) => {
			const file = inFolder(path);
			if (file) await suggestions.restoreVersion(file, before, after);
		},
		adoptClosed: async (path, text) => {
			const file = inFolder(path);
			if (file) await suggestions.adoptDisk(file, text);
		}
	};
}
