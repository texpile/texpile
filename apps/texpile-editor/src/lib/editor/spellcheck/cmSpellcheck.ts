// harper spell/grammar check for SOURCE mode: mask LaTeX markup (texMask), lint the prose with
// the same harper worker + dictionary the visual editor uses, underline with the same
// proofread-* styles, and open the shared SuggestionBox on click.
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Facet, RangeSetBuilder } from '@codemirror/state';
import { onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { createHarperSuggestionBox, type Problem } from '$lib/editor/spellcheck/suggestionBoxFactory';
import { editorConfigStore } from '$lib/stores/editorStore';
import { observe } from '$lib/runes/observe.svelte';
import { docText } from '$lib/editor/source/docText';
import { jumpRevealEffect } from '$lib/editor/source/cmJumpReveal';
import { overlapsMask, type TexMask } from './texMask';
import { sourceProse, splitParagraphs, type Paragraph, type SpellMarkup } from './source/sourceProse';
import { lintParagraphs, paragraphLints } from './source/paragraphLints';
import { clearOfOldWords, liveSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import { nextProblem, type Span } from './problemNav';
import './suggestion.css';
import { cmCommandKeys } from '$lib/keybindings/editors/cmCommandKeys';
import { reviewedMatches } from './review/reviewStore';
import { registerReviewSource, reviewSoon } from './review/reviewQueue';
import { sourceReading } from './review/sourceReading';
import type { ReviewTarget } from './review/reviewTypes';

/** which markup Harper parses the text as (sourceProse.ts) */
export const spellMarkup = Facet.define<SpellMarkup, SpellMarkup>({
	combine: (values) => values[0] ?? 'plaintext'
});

type SpellingOf = (source: string) => SpellLanguage | null;

/** the language this editor's file is checked in, given its text */
const spelledIn = Facet.define<SpellingOf, SpellingOf>({
	combine: (values) => values[0] ?? (() => 'en')
});

const DEBOUNCE_MS = 500;

function cssType(t: string) {
	return t.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'miscellaneous';
}

function languageOf(view: EditorView): SpellLanguage | null {
	return view.state.facet(spelledIn)(docText(view.state.doc));
}

class SpellPlugin {
	decorations: DecorationSet = Decoration.none;
	shown: DecorationSet = Decoration.none;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private gen = 0;
	private enabled = false;
	private ignored = new Set<string>();
	private unsubscribe: () => void;
	private stopRules: () => void;
	private running = false;
	private dirty = false;
	private maskedFor: string | null = null;
	private maskedIn: SpellLanguage | null = null;
	private masked: TexMask | null = null;
	private stopLanguage: () => void;
	private stopReview: () => void;
	// the last pass's paragraphs, for the review to find the ones on screen
	private drawn: {
		src: string;
		paras: Paragraph[];
		spans: [number, number][];
		language: SpellLanguage | null;
		markup: SpellMarkup;
	} | null = null;

	constructor(private view: EditorView) {
		this.stopReview = registerReviewSource({
			visible: () => this.reviewTargetsOnScreen(),
			redraw: () => this.schedule(0)
		});
		this.unsubscribe = observe(
			() => editorConfigStore.current,
			(c) => {
				const on = c?.spellcheck ?? false;
				if (on === this.enabled) return;
				this.enabled = on;
				if (on) this.schedule(0);
				else {
					this.gen++;
					this.decorations = Decoration.none;
					this.shown = Decoration.none;
					this.view.dispatch({});
				}
			}
		);
		// another English or another set of rules: what was found is out of date
		this.stopRules = onLintRulesChanged(() => this.invalidate());
		// the folder's choice, the preference or the main file's language changed
		let checkedIn = languageOf(view);
		this.stopLanguage = observe(
			() => languageOf(view),
			(now) => {
				if (now === checkedIn) return;
				checkedIn = now;
				this.invalidate();
			}
		);
	}

	update(u: ViewUpdate) {
		if (u.docChanged) {
			// invalidate in-flight lints right away: their offsets are against the old doc
			this.gen++;
			this.decorations = this.decorations.map(u.changes);
			this.schedule(DEBOUNCE_MS);
		}
		if (u.docChanged || liveSuggestionRanges(u.startState) !== liveSuggestionRanges(u.state)) {
			this.shown = clearOfOldWords(this.decorations, u.state);
		}
	}

	destroy() {
		this.unsubscribe();
		this.stopRules();
		this.stopLanguage();
		this.stopReview();
		if (this.timer) clearTimeout(this.timer);
		this.gen++;
	}

	ignore(p: Problem) {
		this.ignored.add(`${p.type}:${p.text}`);
		this.schedule(0);
	}

	private reviewTarget(p: Paragraph): ReviewTarget | null {
		const drawn = this.drawn;
		const matches = drawn && paragraphLints(drawn.language, drawn.markup, p.text);
		if (!drawn?.language || !matches) return null;
		return { language: drawn.language, linted: p.text, matches, reading: () => sourceReading(drawn.src, p.from, p.text, drawn.spans) };
	}

	private reviewTargetsOnScreen(): ReviewTarget[] {
		if (!this.enabled || !this.drawn?.language) return [];
		const ranges = this.view.visibleRanges;
		return this.drawn.paras
			.filter((p) => ranges.some((r) => p.from < r.to && p.from + p.text.length > r.from))
			.map((p) => this.reviewTarget(p))
			.filter((t) => t !== null);
	}

	/** the dictionary or the rules changed: paragraphLints dropped what it had, so check again */
	invalidate() {
		this.gen++;
		this.schedule(0);
	}

	schedule(ms: number) {
		if (!this.enabled) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.run(), ms);
	}

	// single-flight: a run requested while one is in progress marks it dirty, and the active run
	// loops until the doc settles instead of piling parallel lints onto the worker
	private async run() {
		if (this.running) {
			this.dirty = true;
			return;
		}
		this.running = true;
		try {
			do {
				this.dirty = false;
				await this.lintPass();
			} while (this.dirty && this.enabled);
		} finally {
			this.running = false;
		}
	}

	private async lintPass() {
		if (!this.enabled) return;
		// Never start a pass under an active IME composition: the rebuild at the end replaces
		// marked ranges near the caret, which aborts the composition on macOS (Windows happens to
		// recover). The commit fires update() again, so deferring loses nothing.
		if (this.view.composing) {
			this.schedule(DEBOUNCE_MS);
			return;
		}
		const gen = ++this.gen;
		const src = docText(this.view.state.doc);
		const markup = this.view.state.facet(spellMarkup);
		const spelling = this.view.state.facet(spelledIn)(src);
		// docText returns the same string for an unchanged doc, so this is a reference compare
		if (this.maskedFor !== src || this.maskedIn !== spelling) {
			this.masked = sourceProse(src, markup, spelling);
			this.maskedFor = src;
			this.maskedIn = spelling;
		}
		const { text, spans } = this.masked!;
		const paras = splitParagraphs(text);
		const fresh = paras.some((p) => !paragraphLints(spelling, markup, p.text));
		const isStale = () => gen !== this.gen || !this.enabled;
		if (!(await lintParagraphs(paras, spelling, markup, isStale))) return;

		// rebuild decorations from the full cache: absolute offset = paragraph start + relative
		const builder = new RangeSetBuilder<Decoration>();
		this.drawn = { src, paras, spans, language: spelling, markup };
		for (const p of paras) {
			const target = this.reviewTarget(p);
			const cached = target ? reviewedMatches(target) : paragraphLints(spelling, markup, p.text);
			if (!cached) continue;
			for (const m of cached) {
				const from = p.from + m.offset;
				const to = from + m.length;
				if (to <= from || to > src.length) continue;
				// lints touching masked markup are artifacts of the space fill, never real prose
				if (overlapsMask(spans, from, to)) continue;
				const problem: Problem = {
					from,
					to,
					msg: m.message,
					shortmsg: m.shortMessage || m.message,
					type: m.type.typeName,
					replacements: m.replacements ?? [],
					text: src.slice(from, to),
					rule: m.rule,
					language: spelling ?? undefined
				};
				if (this.ignored.has(`${problem.type}:${problem.text}`)) continue;
				builder.add(from, to, Decoration.mark({ class: `proofread-${cssType(problem.type)}`, problem }));
			}
		}
		// a composition that STARTED while the worker linted: hold the rebuilt set (the cache is
		// warm, so the deferred pass is cheap) rather than killing the composition with it
		if (this.view.composing) {
			this.schedule(DEBOUNCE_MS);
			return;
		}
		this.decorations = builder.finish();
		this.shown = clearOfOldWords(this.decorations, this.view.state);
		this.view.dispatch({});
		if (fresh) reviewSoon();
	}
}

const spellPlugin = ViewPlugin.fromClass(SpellPlugin, {
	decorations: (p) => p.shown,
	eventHandlers: {
		click(e, view) {
			const plugin = view.plugin(spellPlugin);
			if (!plugin) return false;
			const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
			if (pos == null) return false;
			const hits: Problem[] = [];
			plugin.decorations.between(pos, pos, (from, to, deco) => {
				const p = (deco.spec as { problem?: Problem }).problem;
				// The caret landing exactly at the END of a flagged word is someone clicking past the
				// last letter to put the cursor there, not asking about the word. between() counts a
				// merely touching range as a hit, so without this "Hello World|" pops the box every time.
				if (pos === to) return;
				// positions may have drifted since the lint: read them off the live decoration
				if (p) hits.push({ ...p, from, to, text: view.state.sliceDoc(from, to) });
			});
			if (!hits.length) return false;
			// under the start of the word, matching the visual editor. Anchoring to the click point put
			// the box wherever the pointer happened to be, so the same word opened somewhere different
			// every time and the box could sit on top of the text it was about.
			const anchor = view.coordsAtPos(hits[0].from);
			createHarperSuggestionBox({
				error: hits[0],
				errors: hits,
				position: anchor ? { x: anchor.left, y: anchor.bottom, top: anchor.top } : { x: e.clientX, y: e.clientY },
				onReplace: (value) => {
					view.dispatch({ changes: { from: hits[0].from, to: hits[0].to, insert: value } });
					view.focus();
				},
				onIgnore: () => plugin.ignore(hits[0]),
				onClose: () => {},
				invalidateCache: () => plugin.invalidate()
			});
			return true;
		}
	}
});

/** select the next (1) or previous (-1) problem the plugin is showing */
export function jumpToProblem(view: EditorView, dir: 1 | -1): boolean {
	const spans: Span[] = [];
	view.plugin(spellPlugin)?.shown.between(0, view.state.doc.length, (from, to) => void spans.push({ from, to }));
	const target = nextProblem(spans, view.state.selection.main, dir);
	if (!target) return false;
	view.dispatch({ selection: { anchor: target.from, head: target.to }, effects: jumpRevealEffect(view, target.from), userEvent: 'select' });
	return true;
}

// taken even with no problem to go to, as the key always was
const problemKeymap = cmCommandKeys({
	'editor.nextSpellingProblem': (view) => {
		jumpToProblem(view, 1);
		return true;
	},
	'editor.previousSpellingProblem': (view) => {
		jumpToProblem(view, -1);
		return true;
	}
});

/** proofreading for source mode in the language `spelling` names; obeys the shared spell-check setting */
/** `markup` selects Harper's parser; omit it for LaTeX/plain prose (see spellMarkup). */
export function cmSpellcheck(spelling: SpellingOf, markup?: SpellMarkup) {
	return [spellPlugin, problemKeymap, spelledIn.of(spelling), ...(markup ? [spellMarkup.of(markup)] : [])];
}
