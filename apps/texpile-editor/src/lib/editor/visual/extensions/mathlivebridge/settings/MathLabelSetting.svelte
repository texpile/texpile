<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		name: string;
		hint: string;
		placeholder: string;
		note?: string;
		value: string;
		duplicate: boolean;
		oninput: (e: Event) => void;
		onblur: () => void;
	};

	const props: Props = $props();

	let shown = $state(false);
</script>

<button
	type="button"
	class="text-muted hover:text-surface-900-100 my-3 flex w-full items-center gap-2 text-sm transition-colors"
	onclick={() => (shown = !shown)}
>
	<ChevronDown class="h-4 w-4 transition-transform {shown ? 'rotate-180' : ''}" />
	<span>{m.mathsettings_advanced_options()}</span>
</button>

{#if shown}
	<div class="border-surface-300-700 mb-3 space-y-4 pl-6">
		<label class="label">
			<span>
				{props.name}
				<span class="text-muted text-sm">{props.hint}</span>
			</span>
			<input
				type="text"
				class="input text-sm"
				class:input-error={props.duplicate}
				value={props.value}
				oninput={props.oninput}
				onblur={props.onblur}
				placeholder={props.placeholder}
			/>
			{#if props.duplicate}
				<p class="text-error-ink mt-1 text-xs">{m.mathsettings_label_duplicate_error()}</p>
			{/if}
			{#if props.note}
				<p class="text-muted mt-1 text-xs">{props.note}</p>
			{/if}
		</label>
	</div>
{/if}
