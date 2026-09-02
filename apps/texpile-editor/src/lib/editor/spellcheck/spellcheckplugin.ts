import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createProofreadPlugin, createSpellCheckEnabledStore } from 'prosemirror-proofread';
import { lintText, syncDocumentDictionary } from '$lib/editor/spellcheck/linter';
import { createHarperSuggestionBox } from '$lib/editor/spellcheck/suggestionBoxFactory';
import './suggestion.css';
import { editorConfigStore, editorViewStore } from '$lib/stores/editorStore';
import { activeCompare } from '$lib/workspace/workspaceStore';
import { observe } from '$lib/runes/observe.svelte';

const spellcheckenabled = createSpellCheckEnabledStore(() => false);

observe(
	// The comparison is a dependency, not just the setting: a diff suppresses spell-check while it
	// is open. Squiggles under the same words the diff is tinting is two annotation layers arguing
	// over one line, and neither is about the other - a misspelling that has been in the paper for
	// a year is not what anyone opened a version to look at. The setting is untouched, so it comes
	// back by itself when the comparison closes.
	() => ({ value: editorConfigStore.current, comparing: !!activeCompare.current }),
	({ value, comparing }) => {
		spellcheckenabled.set((value?.spellcheck ?? false) && !comparing);

		// guard on a NON-EMPTY dictionary so the empty default doesn't boot the harper WASM worker
		// on every load; it boots lazily on the first lint once spell-check is enabled
		if (value?.dictionary?.length) {
			syncDocumentDictionary().catch((error) => {
				console.error('[Harper] Failed to sync dictionary:', error);
			});
		}
	}
);

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** the element holding the character just before `pos`, or null when it cannot be resolved */
function elementBefore(view: EditorView, pos: number): HTMLElement | null {
	if (pos <= 0) return null;
	try {
		const { node, offset } = view.domAtPos(pos - 1);
		const raw = node.nodeType === 3 ? node.parentNode : (node.childNodes[offset] ?? node);
		const el = raw instanceof HTMLElement ? raw : (raw?.parentElement ?? null);
		return el;
	} catch {
		return null; // a position the view cannot map; leave the click alone
	}
}

/**
 * Swallows the click that lands exactly AFTER the last letter of a flagged word, so putting the
 * caret at the end of "World" doesn't pop the suggestion box. Also swallows any click inside a
 * link, where the link tooltip is the popup that belongs.
 *
 * Must be registered BEFORE proofreadPlugin: props are consulted in plugin order and the first
 * handler returning true wins, which is the only way to stop that plugin's own handleClick, since
 * it matches with decorationSet.find(pos, pos) and counts a merely touching range as a hit.
 *
 * Deliberately does NOT look at event.target. Clicking past the final letter to place the caret
 * lands outside the flagged span's own box, so the target is the paragraph or heading around it and
 * a target-based test never fires - which is exactly how the first attempt at this missed. The
 * document decides instead: a word character behind the caret, none in front. The DOM is consulted
 * only to confirm that letter is inside a flagged span, so ordinary end-of-word clicks stay
 * untouched (returning true here would eat them for every other click handler too).
 */
export const spellClickBoundaryPlugin = new Plugin({
	props: {
		handleClick(view, pos) {
			const $pos = view.state.doc.resolve(pos);
			// a link's text is an address, not prose, and its own tooltip owns this click
			const linkType = view.state.schema.marks.link;
			if (linkType && $pos.marks().some((mk) => mk.type === linkType)) return true;
			const before = $pos.nodeBefore;
			const after = $pos.nodeAfter;
			const prev = before?.isText ? before.text?.slice(-1) : undefined;
			const next = after?.isText ? after.text?.[0] : undefined;
			// mid-word (a letter on both sides) is a real request for the suggestions; so is the
			// leading edge, which matches how source mode behaves
			if (!prev || !WORD_CHAR.test(prev)) return false;
			if (next && WORD_CHAR.test(next)) return false;
			return !!elementBefore(view, pos)?.closest('[class*="proofread-"]');
		}
	}
});

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * lintText, held back while an IME composition is active.
 *
 * prosemirror-proofread dispatches a full decoration rebuild the moment lint results arrive, and
 * landing that under a composition aborts it on macOS (Windows happens to recover) - with a CJK
 * input method the editor became untypeable. Every composition keystroke changes the composed
 * node, whose cache entry is invalidated, so the plugin's check() always funnels through here
 * mid-composition; stalling the result defers the whole dispatch chain to after compositionend.
 * Capped so a stuck composing flag cannot dam the linter forever.
 */
async function lintTextAfterComposition(text: string) {
	const res = await lintText(text);
	for (let i = 0; i < 100 && editorViewStore.current?.composing; i++) await sleep(150);
	return res;
}

export const proofreadPlugin = createProofreadPlugin(
	500,
	lintTextAfterComposition,
	createHarperSuggestionBox,
	spellcheckenabled,
	undefined, // getCustomText
	true // useCustomCSS: enables the proofread-* class naming
);
