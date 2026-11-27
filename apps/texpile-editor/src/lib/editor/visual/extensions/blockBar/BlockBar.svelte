<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import type { BlockBarModel } from './blockBarPlugin.svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';

	type BlockBarProps = { bar: BlockBarModel };

	const props: BlockBarProps = $props();

	// the editor keeps its focus and the selected block
	function keepFocus(event: MouseEvent): void {
		event.preventDefault();
	}
</script>

<div class="card bg-surface-50-950 border-surface-200-800 flex items-center gap-0.5 border p-0.5 shadow-lg">
	{#each props.bar.actions as action (action.key)}
		<button type="button" class="btn btn-sm px-2" onmousedown={keepFocus} onclick={() => props.bar.run(action)}>
			<action.icon class="size-4" />
			<span class="cap-center">{action.label}</span>
		</button>
	{/each}
	{#if props.bar.settings}
		<button
			type="button"
			class="btn-icon btn-icon-sm"
			aria-label={m.tbar_settings()}
			use:tip={m.tbar_settings()}
			onmousedown={keepFocus}
			onclick={() => props.bar.openSettings()}
		>
			<Settings class="size-4" />
		</button>
	{/if}
</div>
