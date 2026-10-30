<script lang="ts">
	import type { Component } from 'svelte';
	import { tip } from './tooltip';

	type Props = {
		/** false while the pane it borders is shut */
		resizable: boolean;
		resizeLabel: string;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		onReset?: () => void;
		/** the lozenge that shuts and opens the pane; omit for a divider that only resizes */
		toggle?: { icon: Component; onclick: () => void; title: string; ariaLabel: string };
		class?: string;
	};
	const props: Props = $props();
	const Icon = $derived(props.toggle?.icon);
</script>

<!-- Texpile's PaneSplitter: a border, not a fill, so it snaps to whole pixels at any zoom like the rules it meets -->
<div class="border-surface-200-800 relative w-px shrink-0 border-l {props.class ?? ''}">
	<!-- the WAI-ARIA window splitter; svelte's a11y rule does not know it -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="absolute -inset-x-[3px] inset-y-0 transition-colors {props.resizable
			? 'hover:bg-primary-wash active:bg-primary-flood cursor-col-resize'
			: ''}"
		onmousedown={props.resizable ? props.onStartResize : undefined}
		onkeydown={props.resizable ? props.onResizeByKey : undefined}
		ondblclick={props.resizable ? props.onReset : undefined}
		role="separator"
		aria-orientation="vertical"
		aria-label={props.resizeLabel}
		tabindex={props.resizable ? 0 : -1}
	></div>
	{#if props.toggle && Icon}
		<!-- straddles the rule by 3px each side, which the scrollers beside it clear with scroll-inset-r -->
		<button
			class="bg-surface-300-700 hover:bg-primary-500 group absolute top-1/2 left-1/2 z-30 flex h-[72px] w-[7px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white transition-colors"
			onmousedown={(e) => e.preventDefault()}
			onclick={props.toggle.onclick}
			use:tip={props.toggle.title}
			aria-label={props.toggle.ariaLabel}
		>
			<span
				class="bg-surface-500-600 group-hover:bg-primary-500 pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-full transition-colors"
			></span>
			<Icon class="relative size-3.5 shrink-0" />
		</button>
	{/if}
</div>
