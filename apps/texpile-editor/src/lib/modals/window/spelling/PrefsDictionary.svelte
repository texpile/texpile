<script lang="ts">
	// the spelling dictionary, sized for hundreds of words: one box finds and adds, words wrap as chips
	import { Search, X } from '@lucide/svelte';
	import { editorConfigStore } from '$lib/stores/editorStore';
	import { addWordsToDocumentDictionary, removeWordFromDocumentDictionary } from '$lib/editor/spellcheck/harper';
	import { initSpellcheckConfig } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { matching, wordsIn } from '$lib/editor/spellcheck/config/dictionaryWords';
	import { addLanguageWords, languageWords, removeLanguageWord } from '$lib/editor/spellcheck/languages/personalWords';
	import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
	import { settings } from '$lib/settings';
	import { spellLanguageOptions } from '../prefsOptions';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';

	// preferences also opens from the start screen, before any editor has read the word list
	void initSpellcheckConfig();

	/** chips drawn at most; with 3,000 words, redrawing 300 per keystroke lagged */
	const SHOWN = 150;

	let query = $state('');
	// each language keeps its own words; English's are Harper's
	let language = $state<SpellLanguage>(settings.current.spellLanguage);
	const all = $derived(language === 'en' ? (editorConfigStore.current?.dictionary ?? []) : languageWords(language));
	const found = $derived(matching(all, query));
	const typed = $derived(wordsIn(query));
	const toAdd = $derived(typed.filter((w) => !all.includes(w)));

	async function add() {
		const words = toAdd;
		if (!words.length) return;
		// cleared first, so what is typed during the await is not wiped
		query = '';
		await addWords(language, words);
	}

	async function addWords(to: SpellLanguage, words: string[]) {
		if (to === 'en') await addWordsToDocumentDictionary(words);
		else addLanguageWords(to, words);
	}

	async function remove(word: string) {
		const from = language;
		if (from === 'en') await removeWordFromDocumentDictionary(word);
		else removeLanguageWord(from, word);
		toaster.success({
			title: m.spelldict_removed({ word }),
			action: { label: m.menubar_undo(), onClick: () => void addWords(from, [word]) }
		});
	}
</script>

<div class="border-surface-200-800 border-b py-4 last:border-b-0">
	<div class="flex items-baseline justify-between gap-4">
		<div class="text-sm font-medium">{m.spelldict_heading()}</div>
		<div class="flex items-baseline gap-3">
			{#if all.length}
				<span class="text-muted text-xs tabular-nums"
					>{all.length === 1 ? m.spelldict_count_one({ count: 1 }) : m.spelldict_count_other({ count: all.length.toLocaleString() })}</span
				>
			{/if}
			<select class="select w-auto min-w-32 text-sm" bind:value={language} aria-label={m.spelldict_language()}>
				{#each spellLanguageOptions() as o (o.value)}
					<option value={o.value}>{o.label}</option>
				{/each}
			</select>
		</div>
	</div>
	<p class="text-muted mt-1 text-xs leading-relaxed">{m.prefs_dictionary_note()}</p>

	<div class="mt-3 flex gap-2">
		<div class="input flex min-w-0 flex-1 items-center gap-1.5 text-sm">
			<Search class="text-faint size-3.5 shrink-0" />
			<input
				bind:value={query}
				class="min-w-0 flex-1 bg-transparent outline-none"
				placeholder={m.spelldict_find_or_add()}
				aria-label={m.spelldict_find_or_add()}
				spellcheck="false"
				onkeydown={(e) => {
					if (e.key === 'Enter') void add();
					else if (e.key === 'Escape' && query) {
						e.stopPropagation();
						query = '';
					}
				}}
			/>
		</div>
		<button class="btn btn-sm preset-filled-primary-500 shrink-0" type="button" onclick={add} disabled={!toAdd.length}
			>{m.spelldict_add_button()}</button
		>
	</div>

	<div class="border-surface-200-800 rounded-base mt-2 max-h-44 [scrollbar-gutter:stable] overflow-y-auto border p-2">
		{#if !all.length}
			<p class="text-muted py-2 text-center text-sm">{m.spelldict_empty_state()}</p>
		{:else if !found.length}
			<p class="text-muted py-2 text-center text-sm">
				{toAdd.length ? m.spelldict_will_add({ words: toAdd.join(', ') }) : m.spelldict_no_match()}
			</p>
		{:else}
			<ul class="flex flex-wrap gap-1.5">
				{#each found.slice(0, SHOWN) as word (word)}
					<!-- outlined: the typed word is already here, which is why Add stays off -->
					<li
						class="bg-surface-100-900 rounded-base flex max-w-full items-center gap-0.5 border py-0.5 pr-0.5 pl-2 text-sm {typed.includes(
							word
						)
							? 'border-primary-500'
							: 'border-surface-200-800'}"
					>
						<span class="truncate">{word}</span>
						<button
							class="btn-icon btn-icon-xs hover:preset-tonal text-faint hover:text-surface-950-50 size-5 shrink-0"
							type="button"
							aria-label={m.spelldict_remove_word_label({ word })}
							onclick={() => void remove(word)}
						>
							<X class="size-3" />
						</button>
					</li>
				{/each}
			</ul>
			{#if found.length > SHOWN}
				<p class="text-muted mt-2 text-xs">{m.spelldict_more({ count: (found.length - SHOWN).toLocaleString() })}</p>
			{/if}
		{/if}
	</div>
</div>
