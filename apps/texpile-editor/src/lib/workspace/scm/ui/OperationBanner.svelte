<script lang="ts">
	// What git is in the middle of, in words that say where to finish it. A merge the panel can end
	// itself carries Finish and Cancel; a rebase, cherry-pick or revert goes back to the terminal it
	// was started in.
	import { tip } from '$lib/components/tooltip.svelte';
	import { TriangleAlert, Check, Undo2 } from '@lucide/svelte';
	import type { GitOperation } from '$lib/workspace/scm/git';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		operation: GitOperation;
		/** files both sides changed that still hold a marked place */
		marked: number;
		busy: boolean;
		onFinishCombine?: () => void;
		onCancelCombine?: () => void;
	};
	let { operation, marked, busy, onFinishCombine, onCancelCombine }: Props = $props();

	const combining = $derived(operation === 'merge' && !!onFinishCombine && !!onCancelCombine);

	const text = $derived(
		combining
			? marked
				? marked === 1
					? m.vcs_combining_one()
					: m.vcs_combining_count({ count: marked })
				: m.vcs_combining_ready()
			: operation === 'merge'
				? m.vcs_op_merge()
				: operation === 'rebase'
					? m.vcs_op_rebase()
					: operation === 'cherry-pick'
						? m.vcs_op_cherry_pick()
						: m.vcs_op_revert()
	);
</script>

<div class="border-warning-500/40 bg-warning-500/10 mx-2 mt-1 mb-2 flex gap-2 rounded-base border px-2.5 py-2 text-xs" role="status">
	<TriangleAlert class="text-warning-ink mt-0.5 size-3.5 shrink-0" />
	<div class="min-w-0 flex-1 space-y-2">
		<p>{text}</p>
		{#if combining}
			<div class="flex flex-wrap gap-1.5">
				<!-- disabled, not refused after the click: a file with <<<<<<< lines in it
				     must never be saved as though it were the combined text -->
				<span use:tip={marked ? m.vcs_finish_combine_tip() : m.vcs_finish_combine_ready_tip()}>
					<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={onFinishCombine} disabled={busy || marked > 0}>
						<Check class="size-3.5" />
						{m.vcs_finish_combine()}
					</button>
				</span>
				<!-- in the error colour: what it asks next throws away every choice made so far -->
				<button
					class="btn btn-xs preset-outlined-surface-200-800 text-error-ink hover:preset-filled-error-500 gap-1.5"
					onclick={onCancelCombine}
					disabled={busy}
					use:tip={m.vcs_cancel_combine_tip()}
				>
					<Undo2 class="size-3.5" />
					{m.vcs_cancel_combine()}
				</button>
			</div>
		{/if}
	</div>
</div>
