<script lang="ts">
	// The composer for a selection, beside the selection. Nothing is written until the first
	import { tip } from '$lib/components/tooltip.svelte';
	import { oneLine } from '$lib/comments/quoteLabel';
	import { sized } from './sized';
	import { m } from '$lib/paraglide/messages';

	let {
		quote,
		top,
		onSubmit,
		onCancel,
		onSize
	}: {
		quote: string;
		top: number;
		onSubmit: (body: string) => void;
		onCancel: () => void;
		onSize: (height: number) => void;
	} = $props();

	let draft = $state('');
	let box = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		box?.focus({ preventScroll: true });
	});

	function submit() {
		const body = draft.trim();
		if (!body) return;
		draft = '';
		onSubmit(body);
	}
</script>

<div
	class="comment-card comment-card-pending bg-surface-50-950 border-surface-200-800 border text-xs rounded-container"
	style="top: {top}px"
	use:sized={onSize}
>
	<span class="text-muted block truncate font-mono" use:tip={quote}>{oneLine(quote)}</span>
	<textarea
		bind:this={box}
		class="textarea mt-1.5 min-h-8 w-full resize-none text-xs rounded-container"
		rows="2"
		placeholder={m.comments_add()}
		bind:value={draft}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				draft = '';
				onCancel();
			} else if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				submit();
			}
		}}></textarea>
	<div class="mt-1.5 flex items-center gap-1">
		<button class="btn btn-xs preset-filled-primary-500" disabled={!draft.trim()} onclick={submit}>{m.comments_add()}</button>
		<button
			class="btn btn-xs hover:preset-tonal"
			onclick={() => {
				draft = '';
				onCancel();
			}}
		>
			{m.comments_cancel()}
		</button>
	</div>
</div>
