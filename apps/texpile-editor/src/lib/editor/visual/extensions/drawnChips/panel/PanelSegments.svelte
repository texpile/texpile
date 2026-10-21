<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { PanelSegment } from './panelOptions';

	type Props = { options: PanelSegment[]; selected: string | null; label: string; onpick: (value: string) => void };

	const props: Props = $props();
</script>

<div class="border-surface-300-700 rounded-base flex h-7 overflow-hidden border" role="radiogroup" aria-label={props.label}>
	{#each props.options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={props.selected === option.value}
			class="border-surface-300-700 min-w-0 flex-auto truncate border-l px-1.5 text-xs first:border-l-0 {props.selected === option.value
				? 'preset-tonal-primary'
				: 'text-muted hover:preset-tonal'}"
			use:tip={option.hint ?? ''}
			onclick={() => props.onpick(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>
