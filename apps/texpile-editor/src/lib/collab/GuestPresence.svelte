<script lang="ts">
	// A guest's session state, in the title bar's trailing slot next to the window buttons - the same
	// place the host's SessionPresence sits, so the two roles read the same way round.
	//
	// This used to be a full-width bar of its own below the title bar. That cost a row of vertical
	// space to hold one label and one button, and it meant a guest window had no command field and
	// no drag strip while a host's did. Compile and PDF controls were already in EditorTopbar, so
	// the row was carrying nothing else.
	import { tip } from '$lib/components/tooltip.svelte';
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { m } from '$lib/paraglide/messages';
	import { Users, LogOut } from '@lucide/svelte';

	const online = $derived(collabGuest.status === 'online' && collabGuest.hostOnline);
	// only surfaced when something is off (reconnecting / host gone); a healthy session needs no
	// "connected" label next to "Collaborating"
	const statusText = $derived(!collabGuest.hostOnline ? m.session_host_gone() : m.session_status_reconnecting());
</script>

<div class="app-no-drag mr-1 flex shrink-0 items-center gap-2 self-center text-xs">
	<span class="flex items-center gap-1.5">
		<span class="{online ? 'bg-success-500' : 'bg-warning-500'} size-2 shrink-0 rounded-full"></span>
		<span class="font-medium whitespace-nowrap">{m.session_collaborating()}</span>
	</span>
	{#if !online}
		<span class="text-muted whitespace-nowrap">{statusText}</span>
	{/if}

	{#if collabGuest.peers.length}
		<span class="flex items-center gap-1.5" use:tip={collabGuest.peers.map((p) => p.name).join(', ')}>
			<Users class="text-muted size-4 shrink-0" />
			<span class="flex items-center -space-x-1.5">
				{#each collabGuest.peers.slice(0, 5) as peer, i (i)}
					<span
						class="border-surface-100-900 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold text-white"
						style="background-color: {peer.color}"
						use:tip={peer.name}>{(peer.name || '?').slice(0, 1).toUpperCase()}</span
					>
				{/each}
			</span>
		</span>
	{/if}

	<button
		class="text-error-ink hover:bg-surface-200-800 flex h-[22px] items-center gap-1.5 rounded-base px-2"
		onclick={() => {
			collabGuest.leave();
			navigate('/');
		}}
	>
		<LogOut class="size-4 shrink-0" />
		<span class="whitespace-nowrap">{m.session_leave()}</span>
	</button>
</div>
