<script lang="ts">
	// Copy and Restore This Copy, at the end of the comparison's bar while it shows Version History.
	// A restore done goes back to editing: the file is that copy now, and the notice offers Undo.
	import { Copy, RotateCcw } from '@lucide/svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { listLocalHistory, readLocalHistory, LOCAL_REF } from '$lib/workspace/localHistory/localHistory.svelte';
	import { localHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
	import { m } from '$lib/paraglide/messages';

	/** `hash`: the copy the editor compares the file with ('local:<id>') */
	let { path, hash }: { path: string; hash: string } = $props();

	const id = $derived(hash.slice(LOCAL_REF.length));

	async function copy() {
		const text = await readLocalHistory(path, id);
		try {
			if (text === null) throw new Error(m.history_entry_gone());
			await navigator.clipboard.writeText(text);
		} catch {
			toaster.error({ title: m.ctxmenu_copy_failed_toast() });
			return;
		}
		toaster.success({ title: m.history_copied() });
	}

	async function restore() {
		const actions = localHistoryActions.current;
		const entry = (await listLocalHistory(path)).find((e) => e.id === id);
		if (!actions || !entry) return;
		if (await actions.restore(path, entry)) actions.leave(path, hash);
	}
</script>

<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal ml-1 gap-1.5" onclick={copy}>
	<Copy class="size-3.5" />
	<span class="cap-center">{m.history_copy_text()}</span>
</button>
<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={restore}>
	<RotateCcw class="size-3.5" />
	<span class="cap-center">{m.history_restore_this()}</span>
</button>
