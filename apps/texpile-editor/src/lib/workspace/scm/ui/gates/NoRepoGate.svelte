<script lang="ts">
	// The folder is not a repository yet. One line says so in the panel's own word, version, and the
	// button's tooltip says what it does. Publishing waits for the panel itself: once history has
	// started, the changes list is where the author ticks what goes in, and after a first version
	// the panel's main button becomes Publish. A one-step publish that uploaded everything could
	// send a private draft or a large data folder into history for good.
	import { FolderGit2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	let { busy, onInit }: { busy: boolean; onInit: () => void } = $props();
</script>

<div class="flex flex-col items-center gap-3 p-6 text-center">
	<FolderGit2 class="text-faint size-8" />
	<p class="text-muted text-sm">{m.vcs_not_a_repo()}</p>
	<button class="btn btn-xs preset-filled-primary-500 w-full gap-1.5" onclick={onInit} disabled={busy} use:tip={m.vcs_init_repo_tip()}>
		<FolderGit2 class="size-3.5" />
		{m.vcs_init_repo()}
	</button>
</div>
