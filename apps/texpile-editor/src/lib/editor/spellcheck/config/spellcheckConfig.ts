// seeds editorConfigStore (spell-check toggle + custom dictionary) and mirrors changes back so
// they persist. The two halves live in different stores on purpose: the TOGGLE is app
// configuration (settings.json), the WORD LIST is the user's own data (texpile:users).
import { editorConfigStore } from '$lib/stores/editorStore';
import { observe } from '$lib/runes/observe.svelte';
import type { EditorConfiguration } from '$lib/types/editorcfg';
import { loadSettings, updateSettings, settings } from '$lib/settings';
import { userData, updateUserData } from '$lib/storage/userData';

// collaboration/transpileTemplate are required by the type but unused here
const DEFAULT_CONFIG: EditorConfiguration = {
	dictionary: [],
	spellcheck: false,
	transpileTemplate: '',
	collaboration: { anyone: 'none', editors: [] }
};

let initialized = false;

/** seeds editorConfigStore and persists toggle/dictionary changes back. idempotent. */
export async function initSpellcheckConfig(): Promise<void> {
	if (initialized) return;
	initialized = true;

	const s = await loadSettings();
	editorConfigStore.current = { ...DEFAULT_CONFIG, spellcheck: s.spellcheck, dictionary: userData.current.dictionary };

	observe(
		() => editorConfigStore.current,
		(c) => {
			if (!c) return;
			if (c.spellcheck !== settings.current.spellcheck) updateSettings({ spellcheck: c.spellcheck });
			if (c.dictionary !== userData.current.dictionary) updateUserData({ dictionary: c.dictionary });
		}
	);
}

export function setSpellcheckEnabled(enabled: boolean): void {
	editorConfigStore.current = { ...(editorConfigStore.current ?? DEFAULT_CONFIG), spellcheck: enabled };
}

/** turns one grammar rule on or off everywhere; undefined gives it back its default */
export function setGrammarRule(rule: string, on: boolean | undefined): void {
	const { [rule]: _, ...others } = settings.current.grammarRules ?? {};
	updateSettings({ grammarRules: on === undefined ? others : { ...others, [rule]: on } });
}
