<script lang="ts" module>
	/** disabled: there to see but not to tick, as an agent not found */
	export type CheckChoice = { value: string; label: string; aside?: string; warn?: boolean; tip?: string; disabled?: boolean };
</script>

<script lang="ts">
	// a short list of choices: a box ticked on each that is on, or with `one`, a single choice of the list
	import type { Snippet } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = {
		choices: CheckChoice[];
		values: string[];
		label: string;
		ontoggle: (value: string, on: boolean) => void;
		/** what goes under a choice's row, such as the command a custom one runs */
		below?: Snippet<[value: string]>;
		/** radio buttons: picking one is the only way to turn another off */
		one?: boolean;
	};
	const props: Props = $props();
	const name = $props.id();
</script>

<div class="flex w-56 shrink-0 flex-col" role={props.one ? 'radiogroup' : 'group'} aria-label={props.label}>
	{#each props.choices as c (c.value)}
		<label
			class="rounded-base flex h-7 items-center gap-2 px-1.5 text-sm {c.disabled ? 'cursor-default' : 'hover:preset-tonal cursor-pointer'}"
			use:tip={c.tip}
		>
			<input
				type={props.one ? 'radio' : 'checkbox'}
				class="{props.one ? 'radio' : 'checkbox'} shrink-0 scale-75"
				name={props.one ? name : undefined}
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
