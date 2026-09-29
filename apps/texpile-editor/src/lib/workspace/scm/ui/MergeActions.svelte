<script lang="ts">
	// finish or abort a merge where Commit stands; no banner, the Merge Changes group shows what is left
	import { tip } from '$lib/components/tooltip.svelte';
	import { Check, Undo2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** files both sides changed that still hold a marked place */
		marked: number;
		busy: boolean;
		onFinish: () => void;
		onCancel: () => void;
	};
	let { marked, busy, onFinish, onCancel }: Props = $props();

	// in a narrow sidebar a name wraps, and a word too long for the room ends in …
	const LABEL = 'cap-center min-w-0 overflow-x-clip text-ellipsis';
</script>

<div class="border-surface-200-800 shrink-0 space-y-1 border-t px-2 py-2">
	<!-- disabled so a file with <<<<<<< lines never passes as merged; the span holds the tip a disabled button drops -->
	<span class="block" use:tip={marked ? m.vcs_finish_combine_tip() : m.vcs_finish_combine_ready_tip()}>
		<button class="btn btn-xs preset-filled-primary-500 w-full gap-1.5 whitespace-normal" onclick={onFinish} disabled={busy || marked > 0}>
			<Check class="size-3.5 shrink-0" />
			<span class={LABEL}>{m.vcs_finish_combine()}</span>
		</button>
	</span>
	<!-- plain text in the error color: what it asks next throws away every choice made so far -->
	<button
		class="btn btn-xs text-error-ink hover:preset-tonal w-full gap-1.5 whitespace-normal"
		onclick={onCancel}
		disabled={busy}
		use:tip={m.vcs_cancel_combine_tip()}
	>
		<Undo2 class="size-3.5 shrink-0" />
		<span class={LABEL}>{m.vcs_cancel_combine()}</span>
	</button>
</div>
