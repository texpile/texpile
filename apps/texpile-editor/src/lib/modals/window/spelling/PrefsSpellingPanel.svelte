<script lang="ts">
	// the Spelling tab under its switch: the open folder's language, then what holds in every folder
	import { settings, updateSettings, type AppSettings } from '$lib/settings';
	import { openSpelling } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { englishVariantOptions, spellLanguageOptions } from '../prefsOptions';
	import PrefsFolderLanguage from './PrefsFolderLanguage.svelte';
	import PrefsDictionary from './PrefsDictionary.svelte';
	import PrefsGrammarRules from './PrefsGrammarRules.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';
	// grammar is checked in English only
	const grammar = $derived(settings.current.spellLanguage === 'en' || openSpelling.current?.choice.language === 'en');
</script>

{#snippet heading(text: string)}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{text}</h3>
{/snippet}

{#snippet selectRow(text: string, hint: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void)}
	<div class={ROW}>
		<div class="min-w-0">
			<div class="text-sm font-medium">{text}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>
		</div>
		<select class="select w-auto min-w-32 shrink-0 text-sm" {value} onchange={(e) => onChange(e.currentTarget.value)}>
			{#each options as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>
{/snippet}

{@render heading(m.prefs_spell_this_folder())}
<div class="pl-4">
	<PrefsFolderLanguage />
</div>
{@render heading(m.prefs_spell_all_folders())}
<div class="pl-4">
	{@render selectRow(m.prefs_spell_language(), m.prefs_spell_language_note(), settings.current.spellLanguage, spellLanguageOptions(), (v) =>
		updateSettings({ spellLanguage: v as AppSettings['spellLanguage'] })
	)}
	{@render selectRow(
		m.prefs_english_variant(),
		m.prefs_english_variant_note(),
		settings.current.englishVariant ?? '',
		englishVariantOptions(),
		(v) => updateSettings({ englishVariant: v as AppSettings['englishVariant'] })
	)}
	<PrefsDictionary />
	{#if grammar}
		<PrefsGrammarRules />
	{/if}
</div>
