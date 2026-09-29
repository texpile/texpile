// harper spell/grammar check for SOURCE mode: mask LaTeX markup (texMask), lint the prose with
// the same harper worker + dictionary the visual editor uses, underline with the same
// proofread-* styles, and open the shared SuggestionBox on click.
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Facet, RangeSetBuilder } from '@codemirror/state';
import { lintText, onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import { createHarperSuggestionBox, type Problem } from '$lib/editor/spellcheck/suggestionBoxFactory';
import { editorConfigStore } from '$lib/stores/editorStore';
import { observe } from '$lib/runes/observe.svelte';
import { docText } from '$lib/editor/source/docText';
import { maskTex, overlapsMask, type TexMask } from './texMask';
import { clearOfOldWords, liveSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import './suggestion.css';

/**
 * Which markup Harper should parse the text as.
 *
 * 'plaintext' is the default because LaTeX has no Harper parser: texMask strips the markup first
 * and hands over the prose that survives. Harper DOES parse Typst natively, so a .typ file passes
 * 'typst' instead and skips the mask entirely — masking Typst with LaTeX rules would leave `#let`,
 * `$...$` and `@refs` in the text for the grammar checker to complain about.
 */
export const spellLanguage = Facet.define<'plaintext' | 'typst', 'plaintext' | 'typst'>({
	combine: (values) => values[0] ?? 'plaintext'
});

const DEBOUNCE_MS = 500;
// stale paragraphs are joined into worker calls of at most this many chars, so even a first lint
// of a huge doc runs in slices and a fresh edit can supersede between them
const CHUNK_CHARS = 20_000;

function cssType(t: string) {
	return t.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'miscellaneous';
}

type LintMatch = Awaited<ReturnType<typeof lintText>>['matches'][number];

type Paragraph = {
	from: number;
	text: string;
};

// maximal runs of non-blank lines; masked markup is all spaces, so blank lines in the masked text
// are exactly the prose paragraph boundaries of the source (offsets are 1:1 with it)
function splitParagraphs(masked: string): Paragraph[] {
	const paras: Paragraph[] = [];
	const len = masked.length;
	let lineStart = 0;
	let paraStart = -1;
	for (let i = 0; i <= len; i++) {
		if (i < len && masked[i] !== '\n') continue;
		let blank = true;
		for (let k = lineStart; k < i; k++) {
			const c = masked[k];
			if (c !== ' ' && c !== '\t' && c !== '\r') {
				blank = false;
				break;
			}
		}
		if (!blank && paraStart < 0) paraStart = lineStart;
		else if (blank && paraStart >= 0) {
			paras.push({ from: paraStart, text: masked.slice(paraStart, lineStart) });
			paraStart = -1;
		}
		lineStart = i + 1;
	}
	if (paraStart >= 0) paras.push({ from: paraStart, text: masked.slice(paraStart, len) });
	return paras;
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
	// lint results per paragraph text (offsets paragraph-relative); text-keyed, so results survive
	// edits elsewhere in the doc and only changed paragraphs get re-linted
	private cache = new Map<string, LintMatch[]>();
	private running = false;
	private dirty = false;
	private maskedFor: string | null = null;
	private masked: TexMask | null = null;

	constructor(private view: EditorView) {
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
		if (this.timer) clearTimeout(this.timer);
		this.gen++;
	}

	ignore(p: Problem) {
		this.ignored.add(`${p.type}:${p.text}`);
		this.schedule(0);
	}

	/** dictionary changed: cached paragraph results are stale, re-lint from scratch */
	invalidate() {
		this.gen++; // abort any in-flight pass: its results predate the dictionary change
		this.cache.clear();
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
		const language = this.view.state.facet(spellLanguage);
		// docText returns the same string for an unchanged doc, so this is a reference compare
		if (this.maskedFor !== src) {
			// Harper parses Typst itself, so hand it the source untouched. Running texMask over it
			// would blank out constructs by LaTeX's rules and leave Typst's own markup behind.
			this.masked = language === 'typst' ? { text: src, spans: [] } : maskTex(src);
			this.maskedFor = src;
		}
		const { text, spans } = this.masked!;
		const paras = splitParagraphs(text);

		// lint only paragraphs without cached results, a bounded chunk per worker call
		const stale: Paragraph[] = [];
		const queued = new Set<string>();
		for (const p of paras) {
			if (this.cache.has(p.text) || queued.has(p.text)) continue;
			queued.add(p.text);
			stale.push(p);
		}
		const isStale = () => gen !== this.gen || !this.enabled;
		for (let i = 0; i < stale.length;) {
			const batch: Paragraph[] = [];
			let size = 0;
			do {
				size += stale[i].text.length + 2;
				batch.push(stale[i++]);
			} while (i < stale.length && size + stale[i].text.length + 2 <= CHUNK_CHARS);
			const res = await lintText(batch.map((p) => p.text).join('\n\n'), { language, isStale });
			// a newer edit or a disable landed while the worker ran
			if (isStale()) return;
			// transient worker failure: abort without caching, or these paragraphs would be
			// permanently marked clean; the next edit/schedule retries them
			if (res.failed) return;
			const { matches } = res;
			// remap chunk offsets back to paragraph-relative and fill the cache
			let base = 0;
			for (const p of batch) {
				const end = base + p.text.length;
				const rel = matches
					.filter((m) => m.offset >= base && m.offset + m.length <= end)
					.map((m) => ({ ...m, offset: m.offset - base }))
					.sort((a, b) => a.offset - b.offset || a.length - b.length);
				this.cache.set(p.text, rel);
				base = end + 2;
			}
		}

		// rebuild decorations from the full cache: absolute offset = paragraph start + relative
		const builder = new RangeSetBuilder<Decoration>();
		const live = new Set<string>();
		for (const p of paras) {
			live.add(p.text);
			const cached = this.cache.get(p.text);
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
					rule: m.rule
				};
				if (this.ignored.has(`${problem.type}:${problem.text}`)) continue;
				builder.add(from, to, Decoration.mark({ class: `proofread-${cssType(problem.type)}`, problem }));
			}
		}
		// drop cache entries for paragraphs no longer in the doc so the map stays bounded
		for (const key of this.cache.keys()) if (!live.has(key)) this.cache.delete(key);
		// a composition that STARTED while the worker linted: hold the rebuilt set (the cache is
		// warm, so the deferred pass is cheap) rather than killing the composition with it
		if (this.view.composing) {
			this.schedule(DEBOUNCE_MS);
			return;
		}
		this.decorations = builder.finish();
		this.shown = clearOfOldWords(this.decorations, this.view.state);
		this.view.dispatch({});
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
				position: anchor ? { x: anchor.left, y: anchor.bottom } : { x: e.clientX, y: e.clientY },
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

/** harper proofreading for LaTeX source mode; obeys the shared spell-check setting. */
/** `language` selects Harper's parser; omit it for LaTeX/plain prose (see spellLanguage). */
export function cmSpellcheck(language?: 'plaintext' | 'typst') {
	return language ? [spellPlugin, spellLanguage.of(language)] : spellPlugin;
}
