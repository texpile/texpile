<script lang="ts">
	// "Where to find it" for a feature. Values quote the app's own English UI labels verbatim (a
	// menu path reads "File › Shared session" even though this page calls the feature real-time
	// collaboration) — a reader searching the menus needs the string that is actually on screen.
	// Once the docs are translated these have to track the app's translated labels, not be
	// translated independently.
	import Compass from '@lucide/svelte/icons/compass';

	// `value` is the path and nothing else, so it stays scannable; anything qualifying it (when it
	// applies, what it does) goes in `note` and renders muted underneath. One path per row - two
	// crammed into one string is what this block exists to avoid.
	let { rows }: { rows: { label: string; value: string; note?: string }[] } = $props();
</script>

<div class="not-prose border-surface-200-800 bg-surface-100-900 rounded-container my-6 border p-4">
	<div class="mb-3 flex items-center gap-2">
		<Compass class="text-faint h-4 w-4" />
		<span class="text-muted text-xs font-semibold tracking-wide uppercase">{'Where to find it'}</span>
	</div>
	<dl class="divide-surface-200-800 divide-y">
		{#each rows as row (row.label + row.value)}
			<div class="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0 sm:flex-row sm:gap-3">
				<dt class="text-muted shrink-0 sm:w-24">{row.label}</dt>
				<dd class="min-w-0">
					<span class="text-surface-950-50 font-medium">{row.value}</span>
					{#if row.note}
						<span class="text-muted mt-0.5 block text-xs">{row.note}</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</div>
