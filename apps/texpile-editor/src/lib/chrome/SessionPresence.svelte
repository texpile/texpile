<script lang="ts">
	// the host's session in the title bar, left of the command center: the guests' faces and how many. Click opens the share dialog
	import { tip } from '$lib/components/tooltip.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import SessionFaces from '$lib/collab/presence/SessionFaces.svelte';
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';
	import { titleBarLayout } from './titleBarLayout.svelte';

	let { onShareSession }: { onShareSession?: () => void } = $props();

	const count = $derived(collabHost.guestCount());
	const summary = $derived(
		count === 0 ? m.menubar_sharing_waiting() : count === 1 ? m.share_guests_one() : m.share_guests_other({ count })
	);
	$effect(() => {
		const active = collabHost.active;
		untrack(() => titleBarLayout.setSessionLabelled(active));
		return () => untrack(() => titleBarLayout.setSessionLabelled(false));
	});
</script>

{#if collabHost.active}
	<button
		class="app-no-drag title-bar-button shrink-0 gap-1.5 self-center"
		onclick={() => onShareSession?.()}
		use:tip={titleBarLayout.sessionLabel ? m.menubar_share_session() : summary}
	>
		<SessionFaces peers={collabHost.peers} />
		{#if titleBarLayout.sessionLabel}<span class="cap-center whitespace-nowrap">{summary}</span>{/if}
	</button>
{/if}
