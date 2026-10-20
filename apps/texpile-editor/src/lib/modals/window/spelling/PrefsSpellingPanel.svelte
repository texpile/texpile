<script lang="ts">
	// the Spelling tab: the switch, then the open folder's language, then what holds in every folder
	import { settings, updateSettings, type AppSettings } from '$lib/settings';
	import { openSpelling } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { setSpellcheckEnabled } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { englishVariantOptions, spellLanguageOptions } from '../prefsOptions';
	import PrefsHeading from '../rows/PrefsHeading.svelte';
	import PrefsSelectRow from '../rows/PrefsSelectRow.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import PrefsFolderLanguage from './PrefsFolderLanguage.svelte';
	import PrefsDictionary from './PrefsDictionary.svelte';
	import PrefsGrammarRules from './PrefsGrammarRules.svelte';

	// grammar is checked in English only
	const grammar = $derived(settings.current.spellLanguage === 'en' || openSpelling.current?.choice.language === 'en');
</script>

<!-- all of it stays up with the switch off: the Spelling menu's Edit Dictionary leads here -->
<PrefsSwitchRow id="spellcheck" checked={settings.current.spellcheck} onChange={(v) => setSpellcheckEnabled(v)} />
<PrefsHeading section="spellFolder" />
<div class="pl-4">
	<PrefsFolderLanguage />
</div>
<PrefsHeading section="spellAll" />
<div class="pl-4">
	<PrefsSelectRow
		id="spell-language"
		value={settings.current.spellLanguage}
		options={spellLanguageOptions()}
		onChange={(v) => updateSettings({ spellLanguage: v as AppSettings['spellLanguage'] })}
	/>
	<PrefsSelectRow
		id="english-variant"
		value={settings.current.englishVariant ?? ''}
		options={englishVariantOptions()}
		onChange={(v) => updateSettings({ englishVariant: v as AppSettings['englishVariant'] })}
	/>
	<PrefsDictionary />
	{#if grammar}
		<PrefsGrammarRules />
	{/if}
</div>
