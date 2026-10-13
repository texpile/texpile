<script lang="ts">
	// A guest's session state, in the title bar's trailing slot next to the window buttons - the same
	// place, shape and weight as the host's SessionPresence, so the two roles read the same way round.
	// Leave is rare, so it waits in this menu rather than standing in the bar as a button of its own.
	import { LogOut } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { navigate } from '$lib/router.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { menuContentClass, menuItemClass } from '$lib/menus/menuStyles';
	import SessionFaces from './SessionFaces.svelte';
	import { m } from '$lib/paraglide/messages';

	const online = $derived(collabGuest.status === 'online' && collabGuest.hostOnline);
	// only said when something is off (reconnecting, host gone); a healthy session needs nothing beside "Collaborating"
	const label = $derived(
		online ? m.session_collaborating() : !collabGuest.hostOnline ? m.session_host_gone() : m.session_status_reconnecting()
	);

	function leave() {
		collabGuest.leave();
		navigate('/');
	}
</script>

<Menu onSelect={(d) => d.value === 'leave' && leave()}>
	<Menu.Trigger
		class="app-no-drag hover:bg-surface-200-800 rounded-base mr-1 flex h-[22px] shrink-0 items-center gap-1.5 self-center px-1.5 text-xs"
	>
		<SessionFaces peers={collabGuest.peers} />
		<span class="cap-center whitespace-nowrap" class:text-warning-ink={!online}>{label}</span>
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
