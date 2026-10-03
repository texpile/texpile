// Suggest mode as a folder was left, when it opens again. A suggestion is signed: with no name anywhere, suggesting
// waits for the switch, which asks for one
import { savedSuggesting, workspaceRoot } from '$lib/workspace/workspaceStore';
import { suggesting } from '$lib/comments/activeSuggestions.svelte';
import { ownName } from './ownName.svelte';

export function resumeSuggesting(root: string | null): void {
	suggesting.current = !!root && savedSuggesting(root);
	if (!suggesting.current || !root) return;
	void ownName(root).then((name) => {
		if (!name && workspaceRoot.current === root) suggesting.current = false;
	});
}
