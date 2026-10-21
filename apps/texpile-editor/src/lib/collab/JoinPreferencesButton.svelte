<script lang="ts">
	// Preferences from the browser join page, so a guest can set things up before joining
	import { onMount } from 'svelte';
	import { Settings } from '@lucide/svelte';
	import { isValidShareCode } from '$lib/collab/e2e/shareCode';
	import { rememberJoinCode } from '$lib/collab/joinLink.svelte';
	import { takePreferencesReopen } from '$lib/stores/dialogStore';
	import { userData, updateUserData } from '$lib/storage/userData';
	import { m } from '$lib/paraglide/messages';

	let { code, name = $bindable() }: { code: string; name: string } = $props();

	let PreferencesDialog = $state<typeof import('$lib/modals/window/PreferencesDialog.svelte').default | null>(null);
	let open = $state(false);
	let nameAtOpen: string | null = null;

	async function show() {
		// a language change reloads the page, and the code from the link is already out of the URL
		if (isValidShareCode(code)) rememberJoinCode(code);
		if (name.trim() && name.trim() !== userData.current.collabName) updateUserData({ collabName: name.trim() });
		PreferencesDialog ??= (await import('$lib/modals/window/PreferencesDialog.svelte')).default;
		nameAtOpen = userData.current.collabName;
		open = true;
	}

	$effect(() => {
		if (open || nameAtOpen === null) return;
		if (userData.current.collabName !== nameAtOpen) name = userData.current.collabName;
		nameAtOpen = null;
	});

	onMount(() => {
		if (takePreferencesReopen()) void show();
	});
</script>

<button type="button" class="text-muted hover:text-surface-950-50 inline-flex items-center gap-1 text-xs" onclick={show}>
	<Settings class="size-3.5" />
	<span class="cap-center">{m.menubar_preferences()}</span>
</button>

{#if PreferencesDialog}
	<PreferencesDialog bind:open />
{/if}
