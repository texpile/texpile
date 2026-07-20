<script module lang="ts">
	export type RefUpdate = { oldRel: string; newRel: string; hits: { path: string; count: number }[]; total: number };
</script>

<script lang="ts">
	// After a rename/move, offer to repoint the \includegraphics/\input references we found.
	import { m } from '$lib/paraglide/messages';

	let {
		update,
		onKeep,
		onApply
	}: {
		update: RefUpdate;
		onKeep: () => void;
		onApply: () => void;
	} = $props();

	// total refs and file count pluralize independently
	const body = $derived.by(() => {
		const refClause =
			update.total === 1
				? m.wsview_refupdate_ref_count_one({ count: update.total })
				: m.wsview_refupdate_ref_count_other({ count: update.total });
		const fileClause =
			update.hits.length === 1
				? m.wsview_refupdate_file_count_one({ count: update.hits.length })
				: m.wsview_refupdate_file_count_other({ count: update.hits.length });
		const args = { refClause, fileClause, oldRel: update.oldRel, newRel: update.newRel };
		return update.total === 1 ? m.wsview_refupdate_body_one(args) : m.wsview_refupdate_body_other(args);
	});
</script>

<div
	class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
	role="presentation"
	onmousedown={(e) => e.target === e.currentTarget && onKeep()}
>
	<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
		<h2 class="text-lg font-semibold">{m.wsview_refupdate_title()}</h2>
		<p class="text-surface-600-300 mt-2 text-sm">
			{body}
		</p>
		<div class="mt-5 flex justify-end gap-2">
			<button class="btn hover:preset-tonal" onclick={onKeep}>{m.wsview_refupdate_keep()}</button>
			<button class="btn preset-filled-primary-500" onclick={onApply}>{m.wsview_refupdate_apply()}</button>
		</div>
	</div>
</div>
