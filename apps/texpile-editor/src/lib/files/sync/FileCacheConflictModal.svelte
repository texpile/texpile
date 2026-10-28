<script lang="ts">
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { showTwoVersions, twoVersions } from '$lib/workspace/twoVersions.svelte';
	import { m } from '$lib/paraglide/messages';
	import { fileCacheConflicts } from './conflictQueue.svelte';

	const conflict = $derived(fileCacheConflicts.current);

	function showDifference(): void {
		const c = conflict;
		if (!c) return;
		showTwoVersions({
			title: m.filesync_conflict_title(),
			subtitle: m.filesync_difference_sides(),
			path: c.path,
			before: async () => c.disk,
			after: async () => c.memory()
		});
	}
</script>

{#if conflict && !twoVersions.current}
	<Modal title={m.filesync_conflict_title()} card="max-h-full max-w-md overflow-y-auto p-5" dismissable={false}>
		<p class="text-sm">{m.filesync_conflict_body({ name: basename(conflict.path) })}</p>
		<ModalActions
			class="mt-5"
			size="xs"
			buttons={[
				{ label: m.filesync_load_disk(), role: 'primary', onclick: () => fileCacheConflicts.choose('disk') },
				{ label: m.filesync_keep_memory(), role: 'secondary', onclick: () => fileCacheConflicts.choose('memory') },
				{ label: m.filesync_show_difference(), role: 'secondary', onclick: showDifference }
			]}
		/>
	</Modal>
{/if}
