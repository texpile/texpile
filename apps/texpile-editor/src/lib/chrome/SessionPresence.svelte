<script lang="ts">
	// Shared-session presence for the title bar: a live dot, the guest avatars, and the count.
	// Click opens the share dialog.
	//
	// It lives in the title bar's RIGHT block, beside the window buttons, not with the menus. Two
	// reasons. It reads as status rather than as a command, and status belongs at the trailing edge
	// - next to it on the left it looked like a ninth menu that had lost its dropdown. And the left
	// block is what the command center measures itself against: anything in there eats into
	// menuBudget, so opening a session used to push menus into the overflow button.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Users } from '@lucide/svelte';
	import InitialAvatar from '$lib/components/InitialAvatar.svelte';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { m } from '$lib/paraglide/messages';

	let { onShareSession }: { onShareSession?: () => void } = $props();

	const count = $derived(collabHost.guestCount());
	const summary = $derived(
		count === 0 ? m.menubar_sharing_waiting() : count === 1 ? m.share_guests_one() : m.share_guests_other({ count })
	);
</script>

{#if collabHost.active}
	<button
		class="app-no-drag hover:bg-surface-200-800 mr-1 flex h-[22px] shrink-0 items-center gap-1.5 self-center rounded-base px-2 text-xs"
		onclick={() => onShareSession?.()}
		use:tip={m.menubar_share_session()}
	>
		<span class="bg-success-500 size-2 shrink-0 rounded-full"></span>
		<Users class="text-muted size-4 shrink-0" />
		<div class="flex items-center -space-x-1.5">
			{#each collabHost.peers.slice(0, 5) as peer, i (i)}
				<!-- the border is what separates the overlapping stack (-space-x-1.5) into faces -->
				<InitialAvatar name={peer.name} color={peer.color} class="border-surface-100-900 size-5 border text-[10px]" />
			{/each}
		</div>
		<span class="text-muted whitespace-nowrap">{summary}</span>
	</button>
{/if}
