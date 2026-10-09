// mounts the svelte suggestion box for prosemirror-proofread
import { activeWindow } from '$lib/childWindows/childWindowRegistry.svelte';
import { mount, unmount } from 'svelte';
import type { CreateSuggestionBox, Problem as ProofreadProblem } from 'prosemirror-proofread';
import SuggestionBox from './SuggestionBox.svelte';
import { readableSpellText } from './blockSpellText';
import { originOfReplacements } from './linter';
import { suggestSpellings } from './languages/dictionaryClient';
import { isDictionaryLanguage, type SpellLanguage } from './languages/spellLanguages';

// shapes match prosemirror-proofread
type Position = {
	x: number;
	y: number;
};

type OnReplaceCallback = (value: string) => void;
type OnIgnoreCallback = () => void;
type OnCloseCallback = () => void;
type OnInvalidateCacheCallback = () => void;

export type Problem = {
	from: number;
	to: number;
	msg: string;
	shortmsg: string;
	type: string;
	replacements: string[];
	text: string; // the error text itself
	/** the Harper rule that found it */
	rule?: string;
	/** the language it was checked in; English is Harper's */
	language?: SpellLanguage;
};

export type SuggestionBoxOptions = {
	error: Problem;
	errors: Problem[]; // all errors in this segment (overlaps)
	position: Position;
	onReplace: OnReplaceCallback;
	onIgnore: OnIgnoreCallback;
	onClose: OnCloseCallback;
	invalidateCache: OnInvalidateCacheCallback; // force re-check after dictionary changes
};

let currentCleanup: (() => void) | null = null;

// the lib allows { value } objects in replacements; harper hands us plain strings, normalize anyway.
// a word too far from anything known comes with no list at all, and the box still has to open
// for it: ignore and add-to-dictionary are what it is there for
function normalizeProblem(p: ProofreadProblem & { rule?: string; language?: SpellLanguage }): Problem {
	const origin = originOfReplacements(p.replacements);
	return {
		...p,
		rule: p.rule ?? origin?.rule,
		language: p.language ?? origin?.language,
		text: readableSpellText(p.text),
		replacements: (p.replacements ?? []).map((r) => (typeof r === 'string' ? r : r.value))
	};
}

export function createHarperSuggestionBox(options: Parameters<CreateSuggestionBox>[0]): { destroy: () => void } {
	if (currentCleanup) {
		currentCleanup();
		currentCleanup = null;
	}

	const container = document.createElement('div');
	container.id = 'harper-suggestion-container';
	container.style.position = 'fixed';
	container.style.zIndex = '999999';
	container.style.pointerEvents = 'none';
	container.style.top = '0';
	container.style.left = '0';
	container.style.width = '100%';
	container.style.height = '100%';
	activeWindow().document.body.appendChild(container);

	let component: ReturnType<typeof mount> | null = null;
	const error = normalizeProblem(options.error);
	const errors = (options.errors || [options.error]).map(normalizeProblem);
	// a dictionary's suggestions are found when asked for, not with every word it flags
	const language = error.language;
	if (isDictionaryLanguage(language) && !error.replacements.length && error.text)
		void suggestSpellings(language, error.text).then((found) => {
			if (!container.parentNode) return;
			error.replacements = found;
			mountBox();
		});
	else mountBox();

	function mountBox() {
		try {
			component = mount(SuggestionBox, {
				target: container,
				props: {
					error,
					errors,
					position: options.position,
					onReplace: (value: string) => {
						options.onReplace(value);
						destroy();
					},
					onIgnore: () => {
						options.onIgnore();
						destroy();
					},
					onClose: () => {
						options.onClose();
						destroy();
					},
					invalidateCache: options.invalidateCache
				}
			});
		} catch (error) {
			console.error('[Harper] Error mounting component:', error);
		}
	}

	function destroy() {
		if (container && container.parentNode) {
			if (component) {
				unmount(component);
			}
			container.parentNode.removeChild(container);
		}
		if (currentCleanup === destroy) {
			currentCleanup = null;
		}
	}

	currentCleanup = destroy;

	return { destroy };
}
