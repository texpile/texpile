<script lang="ts">
	// the same choice as Spelling > Folder Language
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { AUTOMATIC, chooseFolderLanguage, folderLanguageItems, openSpelling } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { m } from '$lib/paraglide/messages';

	const open = $derived(openSpelling.current);
	const items = $derived(folderLanguageItems(open?.choice ?? null));
	const value = $derived(items.find((item) => item.checked)?.value ?? AUTOMATIC);
	const why = $derived(!open ? m.prefs_folder_language_no_folder() : open.fixed ? m.unavailable_guest() : '');
</script>

<div class="border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0" use:unavailableTip={why}>
	<div class="min-w-0">
		<div class="text-sm font-medium {why ? 'text-faint' : ''}">{m.prefs_folder_language()}</div>
		<p class="text-muted mt-1 text-xs leading-relaxed">{m.prefs_folder_language_note()}</p>
	</div>
	<span class="flex shrink-0" data-tip-anchor>
		<select class="select w-auto min-w-32 text-sm" {value} disabled={!!why} onchange={(e) => chooseFolderLanguage(e.currentTarget.value)}>
			{#each items as item (item.value)}
				<option value={item.value}>{item.label}</option>
			{/each}
		</select>
	</span>
</div>
