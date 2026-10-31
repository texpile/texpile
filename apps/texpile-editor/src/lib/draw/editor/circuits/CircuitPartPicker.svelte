<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CircuitPartKind } from '../figure/figureLanguage';
	import { FIELD_LABEL } from '../ui/panelStyles';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = { parts: readonly CircuitPartKind[]; value: string; onpick: (id: string) => void };
	const props: Props = $props();
	const picked = $derived(props.parts.find((p) => p.id === props.value));
</script>

<div class="px-3 pt-2.5">
	<!-- a part circuitikz has that the tool does not offer is shown by its own name -->
	<div class={FIELD_LABEL}>{m.figure_circuit_part_named({ name: picked?.name ?? props.value })}</div>
	<div class="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1" role="group" aria-label={m.figure_circuit_part()}>
		{#each props.parts as part (part.id)}
			<button
				class="rounded-base flex h-9 items-center justify-center border bg-white p-1 {part.id === props.value
					? 'border-primary-500 ring-primary-500 ring-1'
					: 'border-surface-200-800 hover:border-primary-500'}"
				aria-label={part.name}
				aria-pressed={part.id === props.value}
				use:tip={part.name}
				onclick={() => props.onpick(part.id)}
			>
				<img src={part.icon} alt="" class="max-h-full max-w-full object-contain" />
			</button>
		{/each}
	</div>
</div>
