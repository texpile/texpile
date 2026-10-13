<script lang="ts">
	// the faces of the others in a session, as both the host's and the guest's title bar show them
	import InitialAvatar from '$lib/components/InitialAvatar.svelte';

	type Props = { peers: { name: string; color?: string | null }[] };
	const props: Props = $props();
</script>

{#if props.peers.length}
	<span class="flex items-center -space-x-1">
		{#each props.peers.slice(0, 5) as peer, i (i)}
			<!-- the border is what separates the overlapping faces -->
			<InitialAvatar name={peer.name} color={peer.color} class="border-surface-100-900 size-4 border text-[9px]" />
		{/each}
	</span>
{/if}
