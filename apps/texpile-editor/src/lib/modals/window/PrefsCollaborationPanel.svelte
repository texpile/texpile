<script lang="ts">
	// The Collaboration category: the name the other people in a session see. Git Identity is under
	// Version Control, with the rest of Git's settings.
	import { userData, updateUserData } from '$lib/storage/userData';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import PrefsRow from './rows/PrefsRow.svelte';
	import { m } from '$lib/paraglide/messages';

	const live = $derived(collabHost.active || collabGuest.joined);

	function write(patch: { collabName?: string }) {
		updateUserData(patch);
		collabHost.refreshIdentity();
		collabGuest.refreshIdentity();
	}
</script>

{#if live}
	<p class="text-muted pt-3 text-xs">{m.prefs_collab_live_note()}</p>
{/if}

<PrefsRow id="collab-name">
	<input
		class="input w-48 text-sm"
		maxlength={40}
		aria-label={m.prefs_collab_name()}
		value={userData.current.collabName}
		oninput={(e) => write({ collabName: e.currentTarget.value })}
	/>
</PrefsRow>
