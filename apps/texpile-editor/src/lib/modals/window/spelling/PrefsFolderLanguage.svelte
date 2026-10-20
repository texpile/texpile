<script lang="ts">
	// the same choice as Spelling > Folder Language
	import { AUTOMATIC, chooseFolderLanguage, folderLanguageItems, openSpelling } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import PrefsSelectRow from '../rows/PrefsSelectRow.svelte';
	import { m } from '$lib/paraglide/messages';

	const open = $derived(openSpelling.current);
	const items = $derived(folderLanguageItems(open?.choice ?? null));
	const value = $derived(items.find((item) => item.checked)?.value ?? AUTOMATIC);
	const why = $derived(!open ? m.prefs_folder_language_no_folder() : open.fixed ? m.unavailable_guest() : '');
</script>

<PrefsSelectRow id="folder-language" {value} options={items} onChange={chooseFolderLanguage} {why} />
