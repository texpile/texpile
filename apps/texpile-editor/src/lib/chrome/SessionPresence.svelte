<script lang="ts">
	// Shared-session presence for the title bar: a live dot, the guests' faces and how many. Click opens the share
	// dialog. The same shape and weight as the guest's (GuestPresence) and the title bar's own buttons.
	//
	// It lives in the title bar's RIGHT block, beside the window buttons, not with the menus. Two
	// reasons. It reads as status rather than as a command, and status belongs at the trailing edge
	// - next to it on the left it looked like a ninth menu that had lost its dropdown. And the left
	// block is what the command center measures itself against: anything in there eats into
	// menuBudget, so opening a session used to push menus into the overflow button.
	import { tip } from '$lib/components/tooltip.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import SessionFaces from '$lib/collab/presence/SessionFaces.svelte';
	import { m } from '$lib/paraglide/messages';

	let { onShareSession }: { onShareSession?: () => void } = $props();

	const count = $derived(collabHost.guestCount());
	const summary = $derived(
		count === 0 ? m.menubar_sharing_waiting() : count === 1 ? m.share_guests_one() : m.share_guests_other({ count })
	);
</script>

{#if collabHost.active}
	<button
		class="app-no-drag hover:bg-surface-200-800 rounded-base mr-1 flex h-[22px] shrink-0 items-center gap-1.5 self-center px-1.5 text-xs"
		onclick={() => onShareSession?.()}
		use:tip={m.menubar_share_session()}
	>
		<SessionFaces live peers={collabHost.peers} />
		<span class="cap-center whitespace-nowrap">{summary}</span>
	</button>
{/if}
