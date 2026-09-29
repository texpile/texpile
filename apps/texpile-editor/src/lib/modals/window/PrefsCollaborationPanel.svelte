<script lang="ts">
	// The Collaboration category: the name the other people in a session see. Git Identity is under
	// Version Control, with the rest of Git's settings.
	import { userData, updateUserData } from '$lib/storage/userData';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	const live = $derived(collabHost.active || collabGuest.joined);

	function write(patch: { collabName?: string }) {
		updateUserData(patch);
		collabHost.refreshIdentity();
		collabGuest.refreshIdentity();
	}
</script>

{#snippet label(text: string, hint = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
{/snippet}

{#if live}
	<p class="text-muted pt-3 text-xs">{m.prefs_collab_live_note()}</p>
{/if}

<div class={ROW}>
	{@render label(m.prefs_collab_name(), m.prefs_collab_name_note())}
	<input
		class="input w-48 shrink-0 text-sm"
		maxlength={40}
		value={userData.current.collabName}
		oninput={(e) => write({ collabName: e.currentTarget.value })}
	/>
</div>
