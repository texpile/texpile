<script lang="ts">
	// drafts a package file for a package the open document loads, the way the palette's Save Package File does
	import { packagesWithoutData } from '$lib/editor/snippets/file/packagesWithoutData';
	import { draftPackageFile } from '$lib/editor/snippets/file/savePackageFile';
	import { snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { preferencesOpen } from '$lib/stores/dialogStore';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { packageFilesLocked } from './packageFileDelete';
	import { m } from '$lib/paraglide/messages';

	const root = $derived(workspaceRoot.current);
	const why = $derived(packageFilesLocked('project', root));
	const names = $derived.by(() => {
		void snippetStatus.packages;
		return packagesWithoutData(sourceCmView.current?.state.doc.toString() ?? '');
	});
	let busy = $state(false);

	let picked = $state('');

	async function draft(name: string): Promise<void> {
		const actions = commandPalette.actions;
		if (!name || !root || !actions) return;
		busy = true;
		await draftPackageFile(root, name, (path) => {
			actions.openFile(path);
			preferencesOpen.current = false;
		});
		busy = false;
		picked = '';
	}
</script>

<PrefsRow id="package-files-new" {why}>
	{#snippet children(def)}
		<select
			class="select w-auto min-w-32 text-sm"
			aria-label={def.label()}
			disabled={!!why || busy || !names.length}
			bind:value={picked}
			onchange={() => void draft(picked)}
		>
			<option value="">{names.length ? m.prefs_packages_new_choose() : m.prefs_packages_new_none()}</option>
			{#each names as name (name)}
				<option value={name}>{name}</option>
			{/each}
		</select>
	{/snippet}
</PrefsRow>
