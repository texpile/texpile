<script lang="ts">
	// what Save as template keeps for a project with a Git remote: a copy of its files, or the remote
	import { templateDetails } from './templateDetails.svelte';
	import { m } from '$lib/paraglide/messages';

	const options = [
		{ value: 'files', label: m.template_save_source_files() },
		{ value: 'remote', label: m.template_save_source_remote() }
	] as const;
</script>

<div class="mt-3 flex items-center justify-between gap-4 text-sm">
	<span class="font-medium">{m.template_save_source_label()}</span>
	<div class="bg-surface-200-800 rounded-base flex shrink-0 gap-1 p-0.5" role="radiogroup" aria-label={m.template_save_source_label()}>
		{#each options as option (option.value)}
			{@const active = templateDetails.source === option.value}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				class="rounded-base px-2.5 py-1 text-xs {active
					? 'bg-surface-50-950 font-medium shadow-sm'
					: 'text-muted hover:text-surface-950-50'}"
				onclick={() => (templateDetails.source = option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</div>
