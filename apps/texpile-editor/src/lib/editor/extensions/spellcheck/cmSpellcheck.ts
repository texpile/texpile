// harper spell/grammar check for SOURCE mode: mask LaTeX markup (texMask), lint the prose with
// the same harper worker + dictionary the visual editor uses, underline with the same
// proofread-* styles, and open the shared SuggestionBox on click.
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { lintText } from '$lib/editor/extensions/harper/linter';
import { createHarperSuggestionBox, type Problem } from '$lib/editor/extensions/harper/suggestionBoxFactory';
import { editorConfigStore } from '$lib/stores/editorStore';
import { maskTex, overlapsMask } from './texMask';
import './suggestion.css';

const DEBOUNCE_MS = 500;

const cssType = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'miscellaneous';

class SpellPlugin {
	decorations: DecorationSet = Decoration.none;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private gen = 0;
	private enabled = false;
	private ignored = new Set<string>();
	private unsubscribe: () => void;

	constructor(private view: EditorView) {
		this.unsubscribe = editorConfigStore.subscribe((c) => {
			const on = c?.spellcheck ?? false;
			if (on === this.enabled) return;
			this.enabled = on;
			if (on) this.schedule(0);
			else {
				this.gen++;
				this.decorations = Decoration.none;
				this.view.dispatch({});
			}
		});
	}

	update(u: ViewUpdate) {
		if (u.docChanged) {
			this.decorations = this.decorations.map(u.changes);
			this.schedule(DEBOUNCE_MS);
		}
	}

	destroy() {
		this.unsubscribe();
		if (this.timer) clearTimeout(this.timer);
		this.gen++;
	}

	ignore(p: Problem) {
		this.ignored.add(`${p.type}:${p.text}`);
		this.schedule(0);
	}

	schedule(ms: number) {
		if (!this.enabled) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.run(), ms);
	}

	private async run() {
		const gen = ++this.gen;
		const src = this.view.state.doc.toString();
		const { text, spans } = maskTex(src);
		const { matches } = await lintText(text);
		// a newer edit or a disable landed while the worker ran
		if (gen !== this.gen || !this.enabled) return;
		const builder = new RangeSetBuilder<Decoration>();
		for (const match of matches) {
			const from = match.offset;
			const to = match.offset + match.length;
			if (to <= from || to > src.length) continue;
			// lints touching masked markup are artifacts of the space fill, never real prose
			if (overlapsMask(spans, from, to)) continue;
			const problem: Problem = {
				from,
				to,
				msg: match.message,
				shortmsg: match.shortMessage || match.message,
				type: match.type.typeName,
				replacements: match.replacements ?? [],
				text: src.slice(from, to)
			};
			if (this.ignored.has(`${problem.type}:${problem.text}`)) continue;
			builder.add(from, to, Decoration.mark({ class: `proofread-${cssType(problem.type)}`, problem }));
		}
		this.decorations = builder.finish();
		this.view.dispatch({});
	}
}

const spellPlugin = ViewPlugin.fromClass(SpellPlugin, {
	decorations: (p) => p.decorations,
	eventHandlers: {
		click(e, view) {
			const plugin = view.plugin(spellPlugin);
			if (!plugin) return false;
			const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
			if (pos == null) return false;
			const hits: Problem[] = [];
			plugin.decorations.between(pos, pos, (from, to, deco) => {
				const p = (deco.spec as { problem?: Problem }).problem;
				// positions may have drifted since the lint: read them off the live decoration
				if (p) hits.push({ ...p, from, to, text: view.state.sliceDoc(from, to) });
			});
			if (!hits.length) return false;
			createHarperSuggestionBox({
				error: hits[0],
				errors: hits,
				position: { x: e.clientX, y: e.clientY },
				onReplace: (value) => {
					view.dispatch({ changes: { from: hits[0].from, to: hits[0].to, insert: value } });
					view.focus();
				},
				onIgnore: () => plugin.ignore(hits[0]),
				onClose: () => {},
				invalidateCache: () => plugin.schedule(0)
			});
			return true;
		}
	}
});

/** harper proofreading for LaTeX source mode; obeys the shared spell-check setting. */
export function cmSpellcheck() {
	return spellPlugin;
}
