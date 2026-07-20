<script lang="ts">
	// Confirm before latexindent rewrites the open file in place.
	import { X, Loader2, TriangleAlert } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(),
		formatting,
		onFormat
	}: {
		open: boolean;
		formatting: boolean;
		onFormat: () => void;
	} = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-base font-semibold">
					<TriangleAlert class="text-warning-500 size-5" />
					{m.wsview_format_modal_title()}
				</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => (open = false)} aria-label={m.wsview_close_aria()}>
					<X class="size-4" />
				</button>
			</div>
			<p class="text-surface-600-300 mb-4 text-sm">
				{m.wsview_format_desc_pre()} <code class="bg-surface-200-800 rounded px-1">latexindent</code>{m.wsview_format_desc_post()}
			</p>
			<div class="flex justify-end gap-2">
				<button class="btn btn-sm hover:preset-tonal" onclick={() => (open = false)}>{m.wsview_cancel_label()}</button>
				<button class="btn btn-sm preset-filled-primary-500 gap-1.5" onclick={onFormat} disabled={formatting}>
					{#if formatting}<Loader2 class="size-4 animate-spin" />{/if}
					{m.wsview_format_button()}
				</button>
			</div>
		</div>
	</div>
{/if}
