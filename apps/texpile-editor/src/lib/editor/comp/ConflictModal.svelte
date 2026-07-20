<script lang="ts">
	// The file changed on disk while we held unsaved edits: reload or keep ours.
	import { basename } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	let {
		path,
		onResolve
	}: {
		path: string;
		onResolve: (choice: 'reload' | 'keep') => void;
	} = $props();
</script>

<div class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4">
	<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
		<h2 class="text-lg font-semibold">{m.wsview_conflict_title()}</h2>
		<p class="text-surface-600-300 mt-2 text-sm">
			<span class="font-medium">{basename(path)}</span>
			{m.wsview_conflict_body()}
		</p>
		<div class="mt-5 flex justify-end gap-2">
			<button class="btn hover:preset-tonal" onclick={() => onResolve('reload')}>{m.wsview_reload_from_disk()}</button>
			<button class="btn preset-filled-primary-500" onclick={() => onResolve('keep')}>{m.wsview_keep_my_version()}</button>
		</div>
	</div>
</div>
