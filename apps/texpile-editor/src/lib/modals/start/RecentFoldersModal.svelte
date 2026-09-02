<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Folder } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(false),
		folders,
		onPick
	}: {
		open: boolean;
		folders: string[];
		onPick: (folder: string) => void;
	} = $props();

	function pick(folder: string) {
		open = false;
		onPick(folder);
	}
</script>

<Modal bind:open title={m.start_recent_heading()} icon={Folder}>
	{#each folders as folder (folder)}
		<button
			class="hover:preset-tonal group flex w-full min-w-0 items-center gap-3 rounded px-2 py-1.5 text-left text-sm"
			onclick={() => pick(folder)}
			use:tip={folder}
		>
			<Folder class="text-surface-500 size-4 shrink-0" />
			<span class="flex min-w-0 flex-1 items-baseline gap-2">
				<span class="max-w-[45%] shrink-0 truncate group-hover:underline">{basename(folder)}</span>
				<span class="text-surface-400 min-w-0 truncate text-xs">{folder}</span>
			</span>
		</button>
	{/each}
</Modal>
