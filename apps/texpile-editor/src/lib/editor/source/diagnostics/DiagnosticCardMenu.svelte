<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import IconCircleOff from '@lucide/svelte/icons/circle-off';
	import IconEllipsis from '@lucide/svelte/icons/ellipsis';
	import { m } from '$lib/paraglide/messages';

	const props: { turnOff: { tip: string; apply: () => void } } = $props();
	let open = $state(false);
	let menu = $state<HTMLElement | null>(null);

	function closeOnEscape(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			open = false;
		}
	}

	function closeOutside(e: MouseEvent) {
		if (open && menu && !menu.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onkeydowncapture={closeOnEscape} onmousedowncapture={closeOutside} />

<div class="relative ml-auto" bind:this={menu}>
	<button
		type="button"
		class="btn-icon btn-icon-xs hover:preset-tonal opacity-60 hover:opacity-100"
		aria-label={m.lint_more_actions()}
		aria-expanded={open}
		onmousedown={(e) => e.preventDefault()}
		onclick={() => (open = !open)}
	>
		<IconEllipsis size={14} />
	</button>
	{#if open}
		<div class="card border-surface-300-700 bg-surface-50-950 absolute top-full right-0 z-10 mt-1 border p-1 shadow-xl">
			<button
				type="button"
				class="rounded-base hover:preset-tonal flex w-full items-center gap-2 px-2 py-1 text-xs whitespace-nowrap"
				onmousedown={(e) => e.preventDefault()}
				onclick={props.turnOff.apply}
				use:tip={props.turnOff.tip}
			>
				<IconCircleOff size={13} />
				<span class="cap-center">{m.lint_turn_off()}</span>
			</button>
		</div>
	{/if}
</div>
