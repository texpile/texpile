<script lang="ts">
	// The /session route: the join screen until connected, then the SAME WorkspaceView the host
	// uses, driven by the CRDT-backed provider + guest session (no separate guest editor to drift).
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { guestSession } from '$lib/collab/guestSession';
	import { sessionProvider, GUEST_ROOT } from '$lib/collab/sessionProvider';
	import { dropGuestTypstLsp } from '$lib/languages/typst/intellisense/guestLspExtension';
	import SessionJoin from '$lib/collab/SessionJoin.svelte';
	import WorkspaceView from './workspace/WorkspaceView.svelte';
	import { workspaceRoot, activeFilePath, openFile, fileTree, texFiles } from '$lib/workspace/workspaceStore';
	// collabGuest.joined, not the status: a connected socket is not yet an accepted join, and
	// mounting on status alone flashed the whole workspace up and back down on a bad code
	const joined = $derived(collabGuest.joined);

	$effect(() => {
		if (joined) {
			if (workspaceRoot.current !== GUEST_ROOT) workspaceRoot.current = GUEST_ROOT;
			// open the first shared text file so the guest lands on something editable
			if (!activeFilePath.current) {
				const first = collabGuest.files.find((f) => f.kind === 'text');
				if (first) openFile(first.rel);
			}
		} else {
			// left/ended: don't leak session state into a later host workspace
			if (workspaceRoot.current === GUEST_ROOT) {
				// the LSP client's "server" was this session; fail anything still in flight rather
				// than leave an editor waiting on a host that is gone
				dropGuestTypstLsp();
				workspaceRoot.current = null;
				openFile(null);
				fileTree.current = [];
				texFiles.current = [];
			}
		}
	});
</script>

{#if joined && workspaceRoot.current === GUEST_ROOT}
	{#key 'guest-session'}
		<WorkspaceView provider={sessionProvider} session={guestSession} />
	{/key}
{:else}
	<SessionJoin />
{/if}
