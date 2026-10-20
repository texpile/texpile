<script lang="ts">
	// the package files of one layer: the global folder's, or the open folder's
	import { snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { preferencesOpen } from '$lib/stores/dialogStore';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { deletePackageFile, packageFilesLocked } from './packageFileDelete';
	import { packageFileRows, type PackageLayer } from './packageFileRows';
	import { m } from '$lib/paraglide/messages';

	const props: { layer: PackageLayer } = $props();

	const root = $derived(workspaceRoot.current);
	const rows = $derived(packageFileRows(props.layer, snippetStatus.files, root, snippetStatus.problems));
	const why = $derived(packageFilesLocked(props.layer, root));

	function open(path: string): void {
		commandPalette.actions?.openFile(path);
		preferencesOpen.current = false;
	}
</script>

<PrefsRow id={props.layer === 'global' ? 'package-files-global' : 'package-files-folder'} layout="block" {why}>
	{#snippet children(def)}
		<div class="text-sm font-medium {why ? 'text-faint' : ''}">{def.label()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{def.note?.()}</p>
		{#if rows.length}
			<ul class="mt-2">
				{#each rows as row (row.path)}
					<li class="flex items-start justify-between gap-3 py-1.5">
						<div class="min-w-0">
							<div class="truncate font-mono text-sm">{row.name}</div>
							{#if row.summary}<p class="text-warning-ink text-xs leading-relaxed">{row.summary}</p>{/if}
						</div>
						<div class="flex shrink-0 gap-2">
							<button
								type="button"
								class="btn btn-sm preset-tonal"
								aria-label={m.prefs_packages_open_aria({ name: row.name })}
								disabled={!!why || !commandPalette.actions}
								onclick={() => open(row.path)}>{m.prefs_packages_open()}</button
							>
							<button
								type="button"
								class="btn btn-sm preset-tonal"
								aria-label={m.prefs_packages_delete_aria({ name: row.name })}
								disabled={!!why}
								onclick={() => void deletePackageFile(row, root)}>{m.filetree_delete()}</button
							>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-faint mt-2 text-xs">{m.prefs_packages_empty()}</p>
		{/if}
	{/snippet}
</PrefsRow>
