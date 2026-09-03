<script lang="ts">
	import { Loader2, TriangleAlert, FolderSearch } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { pickFolder } from '$lib/workspace/fileSystem';
	import { checkTutorialFolder, type TutorialFolderState } from '$lib/workspace/starters';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(false),
		onConfirm
	}: {
		open: boolean;
		onConfirm: (root: string) => void;
	} = $props();

	let folderState = $state<TutorialFolderState | null>(null);
	let root = $state<string | null>(null);
	let checking = $state(false);

	$effect(() => {
		if (!open) {
			folderState = null;
			root = null;
		}
	});

	async function chooseFolder() {
		const picked = await pickFolder();
		if (!picked) return;
		checking = true;
		const r = await checkTutorialFolder(picked);
		root = r.root;
		folderState = r.state;
		checking = false;
	}

	function close() {
		open = false;
	}
	function confirm() {
		if (!root) return;
		close();
		onConfirm(root);
	}
</script>

<Modal bind:open title={m.tutorial_confirm_title()} icon={FolderSearch}>
	{#if checking}
		<div class="flex items-center gap-2 text-sm">
			<Loader2 class="size-4 animate-spin" />
			{m.tutorial_checking()}
		</div>
	{:else if folderState === 'occupied'}
		<p class="text-surface-600-300 mb-4 flex items-start gap-2 text-sm">
			<TriangleAlert class="text-warning-500 mt-0.5 size-4 shrink-0" />
			<span>
				{m.tutorial_occupied_desc({ root: root ?? '' })}
			</span>
		</p>
		<ModalActions
			size="xs"
			buttons={[
				{ label: m.tutorial_cancel(), role: 'cancel', onclick: close },
				{ label: m.tutorial_choose_folder(), role: 'primary', icon: FolderSearch, onclick: chooseFolder }
			]}
		/>
	{:else if folderState === 'ours'}
		<p class="text-surface-600-300 mb-4 text-sm">
			{m.tutorial_reopen_desc({ root: root ?? '' })}
		</p>
		<ModalActions
			size="xs"
			buttons={[
				{ label: m.tutorial_cancel(), role: 'cancel', onclick: close },
				{ label: m.tutorial_choose_different_folder(), icon: FolderSearch, onclick: chooseFolder },
				{ label: m.tutorial_open(), role: 'primary', onclick: confirm }
			]}
		/>
	{:else if folderState === 'empty'}
		<p class="text-surface-600-300 mb-4 text-sm">
			{m.tutorial_create_desc({ root: root ?? '' })}
		</p>
		<ModalActions
			size="xs"
			buttons={[
				{ label: m.tutorial_cancel(), role: 'cancel', onclick: close },
				{ label: m.tutorial_choose_different_folder(), icon: FolderSearch, onclick: chooseFolder },
				{ label: m.tutorial_create(), role: 'primary', onclick: confirm }
			]}
		/>
	{:else}
		<p class="text-surface-600-300 mb-4 text-sm">{m.tutorial_pick_empty_desc()}</p>
		<ModalActions
			size="xs"
			buttons={[
				{ label: m.tutorial_cancel(), role: 'cancel', onclick: close },
				{ label: m.tutorial_choose_folder(), role: 'primary', icon: FolderSearch, onclick: chooseFolder }
			]}
		/>
	{/if}
</Modal>
