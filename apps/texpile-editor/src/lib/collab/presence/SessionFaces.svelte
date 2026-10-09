<script lang="ts">
	// the live dot and the faces of the others in a session, as both the host's and the guest's title bar show them
	import InitialAvatar from '$lib/components/InitialAvatar.svelte';

	type Props = { live: boolean; peers: { name: string; color?: string | null }[] };
	const props: Props = $props();
</script>

<span class="{props.live ? 'bg-success-500' : 'bg-warning-500'} size-1.5 shrink-0 rounded-full"></span>
{#if props.peers.length}
	<span class="flex items-center -space-x-1">
		{#each props.peers.slice(0, 5) as peer, i (i)}
			<!-- the border is what separates the overlapping faces -->
			<InitialAvatar name={peer.name} color={peer.color} class="border-surface-100-900 size-4 border text-[9px]" />
		{/each}
	</span>
{/if}
