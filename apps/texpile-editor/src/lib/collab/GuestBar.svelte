<script lang="ts">
	// The guest session's top bar: connection status, who's here, request a compile, leave. Shown
	// in place of the host menu bar when WorkspaceView runs over a shared session.
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';
	import { Users, LogOut, Play, PanelRight } from '@lucide/svelte';

	let { onTogglePdf }: { onTogglePdf: () => void } = $props();

	function requestCompile() {
		collabGuest.requestCompile();
		toaster.info({ title: m.session_compile_requested(), duration: 2500 });
	}
	function leave() {
		collabGuest.leave();
		navigate('/');
	}
</script>

<nav class="border-surface-200-800 flex items-center gap-3 border-b px-3 py-1.5">
	<span class="text-sm font-semibold">Texpile</span>
	<span class="preset-tonal-primary rounded-full px-2 py-0.5 text-xs">
		{collabGuest.status === 'online' ? m.session_status_online() : m.session_status_reconnecting()}
	</span>
	{#if !collabGuest.hostOnline}
		<span class="preset-tonal-warning rounded-full px-2 py-0.5 text-xs">{m.session_host_gone()}</span>
	{/if}
	<div class="ml-auto flex items-center gap-2">
		<div class="flex items-center gap-1" title={collabGuest.peers.map((p) => p.name).join(', ')}>
			<Users class="text-surface-500 size-4" />
			{#each collabGuest.peers.slice(0, 6) as peer, i (i)}
				<span
					class="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
					style="background-color: {peer.color}"
					title={peer.name}>{(peer.name || '?').slice(0, 1).toUpperCase()}</span
				>
			{/each}
		</div>
		<button class="btn btn-sm preset-tonal" onclick={requestCompile} title={m.session_request_compile()}>
			<Play class="size-4" />{m.session_request_compile()}
		</button>
		<button class="btn-icon btn-sm preset-tonal" onclick={onTogglePdf} title={m.session_pdf_tab()} aria-label={m.session_pdf_tab()}>
			<PanelRight class="size-4" />
		</button>
		<button class="btn btn-sm preset-tonal-error" onclick={leave}><LogOut class="size-4" />{m.session_leave()}</button>
	</div>
</nav>
