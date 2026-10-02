<script lang="ts">
	// what the Agent tab says where it cannot work, in place of the conversation
	import { Download, FolderOpen } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { activeFilePath } from '$lib/workspace/workspaceStore';
	import { openWorkspaceForFile } from '$lib/workspace/openWorkspace';
	import type { AgentUnavailable } from '../../agentAvailability';

	type Props = { reason: AgentUnavailable };
	const props: Props = $props();

	const title = $derived(
		props.reason === 'host'
			? m.agent_panel_only_host()
			: props.reason === 'desktop'
				? m.agent_panel_only_desktop()
				: m.agent_panel_single_file()
	);
	const note = $derived(
		props.reason === 'host'
			? m.agent_panel_only_host_note()
			: props.reason === 'desktop'
				? m.agent_panel_only_desktop_note()
				: m.agent_panel_no_folder_note()
	);
</script>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
	<p class="text-sm font-semibold">{title}</p>
	<p class="text-muted max-w-md text-xs leading-relaxed">{note}</p>
	{#if props.reason === 'desktop'}
		<a class="btn btn-sm preset-filled-primary-500 mt-2" href="https://texpile.com/download" target="_blank" rel="noopener noreferrer"
			><Download class="size-4" />{m.session_download()}</a
		>
	{:else if props.reason === 'folder' && activeFilePath.current}
		{@const file = activeFilePath.current}
		<button class="btn btn-sm preset-filled-primary-500 mt-2" onclick={() => void openWorkspaceForFile(file)}
			><FolderOpen class="size-4" />{m.wsview_open_in_workspace()}</button
		>
	{/if}
</div>
