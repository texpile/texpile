<script lang="ts">
	// Title bar plus a scrolling body, for the full-window screens that are not the workspace: the
	// start screen, the session-join screen, the error page.
	//
	// The workspace does not use this - it puts the menus inside its own TitleBar and manages its own
	// panes - but a frameless window still needs a drag strip and a close button on every screen, and
	// the alternative was repeating the same three lines in each of them.
	import { onMount, type Snippet } from 'svelte';
	import TitleBar from './TitleBar.svelte';
	import { publishHomeMenuState } from '$lib/workspace/nativeMenu';

	let { children }: { children: Snippet } = $props();

	// macOS: the native bar otherwise keeps the last workspace's menus, whose items fire at handlers
	// this screen does not have
	onMount(publishHomeMenuState);
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<TitleBar />
	<!-- the body scrolls, not the window: with a frameless window a scrolled document would take the
	     title bar with it and there would be nothing left to drag or close by -->
	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
		{@render children()}
	</div>
</div>
