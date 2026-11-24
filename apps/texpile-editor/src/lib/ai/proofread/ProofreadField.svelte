<script lang="ts">
	// one setting of the proofreading service: its name, a hint, and the field across the row
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		note?: string;
		value: string;
		placeholder?: string;
		secret?: boolean;
		onchange?: (value: string) => void;
		/** every key typed, for a field whose button needs to know at once */
		oninput?: (value: string) => void;
		/** the button that acts on the field, beside it */
		action?: Snippet;
	};
	const props: Props = $props();
</script>

<div class="border-surface-200-800 border-b py-3">
	<div class="text-sm font-medium">{props.label}</div>
	{#if props.note}<p class="text-muted mt-1 text-xs leading-relaxed">{props.note}</p>{/if}
	<div class="mt-2 flex gap-2">
		<input
			class="input min-w-0 flex-1 font-mono text-xs"
			type={props.secret ? 'password' : 'text'}
			spellcheck="false"
			autocomplete="off"
			aria-label={props.label}
			placeholder={props.placeholder}
			value={props.value}
			onchange={(e) => props.onchange?.(e.currentTarget.value.trim())}
			oninput={(e) => props.oninput?.(e.currentTarget.value.trim())}
		/>
		{@render props.action?.()}
	</div>
</div>
