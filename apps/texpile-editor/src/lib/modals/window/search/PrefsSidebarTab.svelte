<script lang="ts">
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { label: string; active: boolean; unavailable?: boolean; matches?: number; dimmed?: boolean; onclick: () => void };
	const props: Props = $props();
</script>

{#if props.unavailable}
	<!-- aria-disabled, not disabled: a disabled button takes no hover, and the hover is what says why -->
	<button
		class="rounded-base mb-0.5 block w-full cursor-default px-3 py-1.5 text-left text-sm opacity-50"
		aria-disabled="true"
		use:unavailableTip={m.unavailable_desktop()}
	>
		{props.label}
	</button>
{:else}
	<button
		class="rounded-base mb-0.5 flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm {props.active
			? 'bg-primary-tint font-medium'
			: 'hover:preset-tonal'} {props.dimmed ? 'opacity-50' : ''}"
		aria-current={props.active ? 'page' : undefined}
		onclick={props.onclick}
	>
		<span class="min-w-0 truncate">{props.label}</span>
		{#if props.matches}
			<span class="bg-primary-500 text-primary-contrast-500 rounded-full px-1.5 text-xs tabular-nums">{props.matches}</span>
		{/if}
	</button>
{/if}
