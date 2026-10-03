<script lang="ts" module>
	/** disabled: there to see but not to tick, as an agent not found */
	export type CheckChoice = { value: string; label: string; aside?: string; warn?: boolean; tip?: string; disabled?: boolean };
</script>

<script lang="ts">
	// a short list of choices that are not one of a kind: a box ticked on each that is on
	import type { Snippet } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = {
		choices: CheckChoice[];
		values: string[];
		label: string;
		ontoggle: (value: string, on: boolean) => void;
		/** what goes under a choice's row, such as the command a custom one runs */
		below?: Snippet<[value: string]>;
	};
	const props: Props = $props();
</script>

<div class="flex w-56 shrink-0 flex-col" role="group" aria-label={props.label}>
	{#each props.choices as c (c.value)}
		<label
			class="rounded-base flex h-7 items-center gap-2 px-1.5 text-sm {c.disabled ? 'cursor-default' : 'hover:preset-tonal cursor-pointer'}"
			use:tip={c.tip}
		>
			<input
				type="checkbox"
				class="checkbox shrink-0 scale-75"
				checked={props.values.includes(c.value)}
				disabled={c.disabled}
				onchange={(e) => props.ontoggle(c.value, e.currentTarget.checked)}
			/>
			<span class="min-w-0 flex-1 truncate {c.disabled ? 'opacity-50' : ''}">{c.label}</span>
			{#if c.aside}
				<span class="shrink-0 text-xs {c.warn ? 'text-warning-ink' : 'text-muted'}">{c.aside}</span>
			{/if}
		</label>
		{@render props.below?.(c.value)}
	{/each}
</div>
