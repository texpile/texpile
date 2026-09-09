<script lang="ts">
	// Window-level dialogs, mounted once per workspace whoever is driving it.
	//
	// These used to hang off WorkspaceMenuBar, which owns the menu items that open them. That held
	// while the menus were the only way in, and survived macOS because the menu bar still mounts
	// there with its triggers hidden. It did NOT survive a guest session: WorkspaceChrome renders no
	// menu bar for a guest, so the dialogs were never in the tree, and the palette's Preferences
	// command - a guest's only route to Preferences, since it has no menus - set a flag with nothing
	// listening and looked broken.
	//
	// Mounted outside the guest/host branch, driven by dialogStore, so who opens them is no longer
	// tangled up with who renders them.
	import PreferencesDialog from './PreferencesDialog.svelte';
	import SpellcheckDictionary from './SpellcheckDictionary.svelte';
	import ShortcutsDialog from './ShortcutsDialog.svelte';
	import { preferencesOpen, dictionaryOpen, takePreferencesReopen } from '$lib/stores/dialogStore';

	if (takePreferencesReopen()) preferencesOpen.current = true;
</script>

<PreferencesDialog bind:open={preferencesOpen.current} />
<SpellcheckDictionary bind:open={dictionaryOpen.current} />
<ShortcutsDialog />
