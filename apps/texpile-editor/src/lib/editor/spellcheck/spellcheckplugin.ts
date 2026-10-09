import { Plugin, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { createProofreadPlugin, createSpellCheckEnabledStore, invalidateProofreadCache } from 'prosemirror-proofread';
import { onLintRulesChanged, syncDocumentDictionary } from '$lib/editor/spellcheck/linter';
import { proofreadIn } from '$lib/editor/spellcheck/languages/proofreadIn';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { blockSpellText, chipLetters, harperReading } from '$lib/editor/spellcheck/blockSpellText';
import { createHarperSuggestionBox } from '$lib/editor/spellcheck/suggestionBoxFactory';
import { nextProblem } from './problemNav';
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

/** struck words take a click for the caret beside them (pmOldWordsCaret), never for the squiggle they touch */
function onOldWords(event: MouseEvent): boolean {
	return event.target instanceof Element && event.target.closest('.pm-suggest-old') !== null;
}

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
		handleClick(view, pos, event) {
			if (onOldWords(event)) return false;
			const $pos = view.state.doc.resolve(pos);
			// a link's text is an address, not prose, and its own tooltip owns this click
			const linkType = view.state.schema.marks.link;
			if (linkType && $pos.marks().some((mk) => mk.type === linkType)) return true;
			const before = $pos.nodeBefore;
			const after = $pos.nodeAfter;
			const prev = before?.isText ? before.text?.slice(-1) : before && chipLetters(before)?.slice(-1);
			const next = after?.isText ? after.text?.[0] : undefined;
			// mid-word (a letter on both sides) is a real request for the suggestions; so is the
			// leading edge, which matches how source mode behaves
			if (!prev || !WORD_CHAR.test(prev)) return false;
			if (next && WORD_CHAR.test(next)) return false;
			const flagged = elementBefore(view, pos)?.closest('[class*="proofread-"]');
			if (!flagged) return false;
			// the caret resolves after the last letter from anywhere on its right half, which on a
			// short word is most of it: only a click past the word's own box is caret placement
			const rects = flagged.getClientRects();
			const box = rects[rects.length - 1];
			if (!box || box.width === 0) return true;
			return event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
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
async function lintTextAfterComposition(block: string, language: SpellLanguage | null) {
	// harper reads a chip as a formula; a dictionary splits words at the markers, so its offsets are the block's
	const reading = language === 'en' ? harperReading(block) : null;
	const text = reading?.text ?? block;
	const res = text.trim() ? await proofreadIn(language, text) : { matches: [] };
	for (let i = 0; i < 100 && editorViewStore.current?.composing; i++) await sleep(150);
	return reading ? { ...res, matches: res.matches.map((match) => ({ ...match, ...reading.blockSpan(match.offset, match.length) })) } : res;
}

const proofreadPlugins = new WeakSet<Plugin>();

function proofreadOf(state: EditorState): Plugin | undefined {
	return state.plugins.find((plugin) => proofreadPlugins.has(plugin));
}

/** one per editor: the library debounces per instance, and each editor's file has its own language */
export function proofreadPlugin(language: () => SpellLanguage | null): Plugin {
	const libraryPlugin = createProofreadPlugin(
		500,
		(block: string) => lintTextAfterComposition(block, language()),
		createHarperSuggestionBox,
		spellcheckenabled,
		blockSpellText,
		true // useCustomCSS: enables the proofread-* class naming
	);
	// the library's own spec and key, with its click kept off struck words
	const plugin: Plugin = new Plugin({
		...libraryPlugin.spec,
		view(view) {
			const inner = libraryPlugin.spec.view?.(view);
			// another English, another set of rules or another language: what was found is out of date
			const stopRules = onLintRulesChanged(() => invalidateProofreadCache(view));
			let checkedIn = language();
			const stopLanguage = observe(language, (now) => {
				if (now === checkedIn) return;
				checkedIn = now;
				invalidateProofreadCache(view);
			});
			return {
				...inner,
				destroy() {
					stopRules();
					stopLanguage();
					inner?.destroy?.();
				}
			};
		},
		props: {
			...libraryPlugin.spec.props,
			handleClick(view, pos, event) {
				return !onOldWords(event) && !!libraryPlugin.spec.props?.handleClick?.call(this, view, pos, event);
			}
		}
	});
	proofreadPlugins.add(plugin);
	return plugin;
}

const chipSquiggles = new WeakMap<DecorationSet, DecorationSet>();

/** a squiggle over a word also draws on a letter chip inside it, since ProseMirror hands the chip's hidden text the one it covers */
export const spellChipPlugin = new Plugin({
	props: {
		decorations(state) {
			const squiggles: DecorationSet | undefined = proofreadOf(state)?.getState(state)?.decor;
			if (!squiggles || squiggles === DecorationSet.empty) return null;
			let drawn = chipSquiggles.get(squiggles);
			if (drawn) return drawn;
			const chips: Decoration[] = [];
			for (const squiggle of squiggles.find()) {
				// the class prosemirror-proofread gives the squiggle itself
				const kind: string = squiggle.spec.errors[0].type;
				const attrs = { class: `proofread-${kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` };
				state.doc.nodesBetween(squiggle.from, squiggle.to, (node, pos) => {
					if (pos >= squiggle.from && pos + node.nodeSize <= squiggle.to && chipLetters(node))
						chips.push(Decoration.node(pos, pos + node.nodeSize, attrs));
				});
			}
			drawn = DecorationSet.create(state.doc, chips);
			chipSquiggles.set(squiggles, drawn);
			return drawn;
		}
	}
});

function jumpToProblem(dir: 1 | -1): Command {
	return (state, dispatch) => {
		const squiggles: DecorationSet | undefined = proofreadOf(state)?.getState(state)?.decor;
		const target = nextProblem(squiggles?.find() ?? [], state.selection, dir);
		if (!target) return false;
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, target.from, target.to)).scrollIntoView());
		return true;
	};
}

/** F8 and Shift-F8, as in source mode: to the next or previous spelling or grammar problem */
export const spellProblemKeymap = keymap({ F8: jumpToProblem(1), 'Shift-F8': jumpToProblem(-1) });
