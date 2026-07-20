<script lang="ts">
	// The /session route: the join screen until connected, then the SAME WorkspaceView the host
	// uses, driven by the CRDT-backed provider + guest session (no separate guest editor to drift).
	import { get } from 'svelte/store';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { guestSession } from '$lib/collab/guestStore.svelte';
	import { sessionProvider, GUEST_ROOT } from '$lib/collab/sessionProvider';
	import SessionJoin from '$lib/collab/SessionJoin.svelte';
	import WorkspaceView from './WorkspaceView.svelte';
	import { workspaceRoot, activeFilePath, fileTree, texFiles } from '$lib/workspace/workspaceStore';
	const joined = $derived(collabGuest.status === 'online' || collabGuest.status === 'reconnecting');

	$effect(() => {
		if (joined) {
			if (get(workspaceRoot) !== GUEST_ROOT) workspaceRoot.set(GUEST_ROOT);
			// open the first shared text file so the guest lands on something editable
			if (!get(activeFilePath)) {
				const first = collabGuest.files.find((f) => f.kind === 'text');
				if (first) activeFilePath.set(first.rel);
			}
		} else {
			// left/ended: don't leak session state into a later host workspace
			if (get(workspaceRoot) === GUEST_ROOT) {
				workspaceRoot.set(null);
				activeFilePath.set(null);
				fileTree.set([]);
				texFiles.set([]);
			}
		}
	});
</script>

{#if joined && $workspaceRoot === GUEST_ROOT}
	{#key 'guest-session'}
		<WorkspaceView provider={sessionProvider} session={guestSession} />
	{/key}
{:else}
	<SessionJoin />
{/if}
