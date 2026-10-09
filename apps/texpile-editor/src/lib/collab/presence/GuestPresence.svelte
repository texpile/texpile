<script lang="ts">
	// A guest's session state, in the title bar's trailing slot next to the window buttons - the same
	// place, shape and weight as the host's SessionPresence, so the two roles read the same way round.
	//
	// This used to be a full-width bar of its own below the title bar. That cost a row of vertical
	// space to hold one label and one button, and it meant a guest window had no command field and
	// no drag strip while a host's did. Compile and PDF controls were already in EditorTopbar, so
	// the row was carrying nothing else.
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import SessionFaces from './SessionFaces.svelte';
	import { m } from '$lib/paraglide/messages';
	import { LogOut } from '@lucide/svelte';

	const online = $derived(collabGuest.status === 'online' && collabGuest.hostOnline);
	// only said when something is off (reconnecting, host gone); a healthy session needs nothing beside "Collaborating"
	const label = $derived(
		online ? m.session_collaborating() : !collabGuest.hostOnline ? m.session_host_gone() : m.session_status_reconnecting()
	);
</script>

<div class="app-no-drag mr-1 flex shrink-0 items-center gap-1 self-center text-xs">
	<span class="flex h-[22px] items-center gap-1.5 px-1.5">
		<SessionFaces live={online} peers={collabGuest.peers} />
		<span class="cap-center whitespace-nowrap">{label}</span>
	</span>
	<!-- red only under the pointer: leaving is rare, and a red word was the loudest thing in the bar -->
	<button
		class="hover:bg-surface-200-800 hover:text-error-ink rounded-base flex h-[22px] items-center gap-1 px-1.5"
		onclick={() => {
			collabGuest.leave();
			navigate('/');
		}}
	>
		<LogOut class="size-3.5 shrink-0" />
		<span class="cap-center whitespace-nowrap">{m.session_leave()}</span>
	</button>
</div>
