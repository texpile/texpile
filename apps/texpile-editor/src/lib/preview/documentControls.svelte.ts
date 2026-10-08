// the project's controls (Compile, Problems, comments, edit mode), set by the workspace; the docked preview's bar draws
// them, and with no such bar the title bar does
import type { Snippet } from 'svelte';

// `compact`: drawn in the title bar
export const documentControls = $state<{ current: Snippet<[compact?: boolean]> | null; previewBars: number }>({
	current: null,
	previewBars: 0
});
