<script lang="ts">
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { onWindowButtonsMoved, windowButtonsAtEnd } from '$lib/chrome/windowOverlay';
	import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import LayoutMenu from './LayoutMenu.svelte';
	import TitleBarDivider from '$lib/chrome/TitleBarDivider.svelte';

	type Props = {
		panes: PaneLayout;
		termDock: TerminalDockState;
		/** a file opened on its own has nothing to arrange, so no menu */
		project: boolean;
		splittable: boolean;
	};
	const props: Props = $props();
	// the browser build ends the bar with its download link; the desktop app with whatever window buttons sit on the right
	let buttonsAtEnd = $state(windowButtonsAtEnd());
	$effect(() => onWindowButtonsMoved(() => (buttonsAtEnd = windowButtonsAtEnd())));
	const divided = $derived(!isDesktop() || buttonsAtEnd);
</script>

{#if props.project}
	<div class="app-no-drag flex items-center self-center {divided ? '' : 'mr-1.5'}">
		<LayoutMenu panes={props.panes} termDock={props.termDock} splittable={props.splittable} />
	</div>
{/if}
{#if divided}
	<TitleBarDivider />
{/if}
