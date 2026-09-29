// mounts the svelte suggestion box for prosemirror-proofread
import { mount, unmount } from 'svelte';
import type { CreateSuggestionBox, Problem as ProofreadProblem } from 'prosemirror-proofread';
import SuggestionBox from './SuggestionBox.svelte';
import { readableSpellText } from './blockSpellText';
import { ruleOfReplacements } from './linter';

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
function normalizeProblem(p: ProofreadProblem & { rule?: string }): Problem {
	return {
		...p,
		rule: p.rule ?? ruleOfReplacements(p.replacements) ?? undefined,
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
	document.body.appendChild(container);

	let component: ReturnType<typeof mount> | null = null;
	try {
		component = mount(SuggestionBox, {
			target: container,
			props: {
				error: normalizeProblem(options.error),
				errors: (options.errors || [options.error]).map(normalizeProblem),
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
