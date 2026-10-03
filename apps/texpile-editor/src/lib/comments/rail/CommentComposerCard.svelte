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
		/** `keyed`: sent with Enter, so the reader's hands are on the keyboard and go back to the text */
		onSubmit: (body: string, keyed: boolean) => void;
		onCancel: () => void;
		onSize: (height: number) => void;
	} = $props();

	let draft = $state('');
	let box = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		box?.focus({ preventScroll: true });
	});

	// going back to the text without writing anything takes the composer with it: the passage stays
	// marked while this card is open, and a card nobody is writing in leaves a mark nobody asked for.
	// A started note is never thrown away, so the card stays once there is anything in it
	$effect(() => {
		function onFocusIn(e: FocusEvent) {
			const into = e.target as HTMLElement | null;
			if (!into?.closest?.('.ProseMirror, .cm-editor')) return;
			if (draft.trim()) return;
			onCancel();
		}
		document.addEventListener('focusin', onFocusIn);
		return () => document.removeEventListener('focusin', onFocusIn);
	});

	function submit(keyed: boolean) {
		const body = draft.trim();
		if (!body) return;
		draft = '';
		onSubmit(body, keyed);
	}
</script>

<div
	class="comment-card comment-card-pending bg-surface-50-950 border-surface-200-800 rounded-container border text-xs"
	style="top: {top}px"
	use:sized={onSize}
>
	<span class="text-muted block truncate font-mono" use:tip={quote}>{oneLine(quote)}</span>
	<textarea
		bind:this={box}
		class="textarea rounded-container mt-1.5 min-h-8 w-full resize-none text-xs"
		rows="2"
		placeholder={m.comments_add()}
		bind:value={draft}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				draft = '';
				onCancel();
			} else if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				submit(true);
			}
		}}></textarea>
	<div class="mt-1.5 flex items-center gap-1">
		<button class="btn btn-xs preset-filled-primary-500" disabled={!draft.trim()} onclick={() => submit(false)}>{m.comments_add()}</button>
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
