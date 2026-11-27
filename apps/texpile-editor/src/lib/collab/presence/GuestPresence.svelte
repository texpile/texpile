<script lang="ts">
	// a guest's session in the title bar, where the host's SessionPresence stands.
	// Leave is rare, so it waits in this menu rather than standing in the bar as a button of its own.
	import { LogOut } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { menuContentClass, menuItemClass } from '$lib/menus/menuStyles';
	import SessionFaces from './SessionFaces.svelte';
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';
	import { titleBarLayout } from '$lib/chrome/titleBarLayout.svelte';

	const online = $derived(collabGuest.status === 'online' && collabGuest.hostOnline);
	// only said when something is off (reconnecting, host gone); a healthy session needs nothing beside "Collaborating"
	const label = $derived(
		online ? m.session_collaborating() : !collabGuest.hostOnline ? m.session_host_gone() : m.session_status_reconnecting()
	);

	$effect(() => {
		untrack(() => titleBarLayout.setSessionLabelled(true));
		return () => untrack(() => titleBarLayout.setSessionLabelled(false));
	});

	function leave() {
		collabGuest.leave();
		navigate('/');
	}
</script>

<Menu onSelect={(d) => d.value === 'leave' && leave()}>
	<Menu.Trigger class="app-no-drag title-bar-button shrink-0 gap-1.5 self-center">
		<SessionFaces peers={collabGuest.peers} />
		<!-- a problem with the connection is said at any width -->
		{#if titleBarLayout.sessionLabel || !online}
			<span class="cap-center whitespace-nowrap" class:text-warning-ink={!online}>{label}</span>
		{/if}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="leave" class="{menuItemClass} text-error-ink">
					<span class="flex items-center gap-2.5">
						<LogOut class="size-4 shrink-0" /><Menu.ItemText class="cap-center">{m.session_leave()}</Menu.ItemText>
					</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
