<script lang="ts">
	import { isMac } from '$lib/platform';
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { onWindowButtonsMoved, windowButtonsAtStart } from '$lib/chrome/windowOverlay';
	import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import LayoutMenu from './LayoutMenu.svelte';

	type Props = {
		panes: PaneLayout;
		termDock: TerminalDockState;
		/** a file opened on its own has no sidebar and one editor */
		project: boolean;
		splittable: boolean;
	};
	const props: Props = $props();
	// macOS keeps its window buttons on the left, and a Linux desktop can too: nothing follows on the right to set apart
	let buttonsAtStart = $state(windowButtonsAtStart());
	$effect(() => onWindowButtonsMoved(() => (buttonsAtStart = windowButtonsAtStart())));
	const divided = $derived(!(isDesktop() && (isMac || buttonsAtStart)));
</script>

<div class="app-no-drag flex items-center self-center {divided ? '' : 'mr-1.5'}">
	<LayoutMenu panes={props.panes} termDock={props.termDock} project={props.project} splittable={props.splittable} />
</div>
{#if divided}
	<div class="border-surface-300-700 mx-2 h-4 w-px shrink-0 self-center border-l"></div>
{/if}
