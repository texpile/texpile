// the visual editor's find and replace: matches, the one under the selection, stepping and replacing
import { untrack } from 'svelte';
import { NodeSelection, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';
import type { DecorationSet, EditorView } from 'prosemirror-view';
import { editorViewStore } from '$lib/stores/editorStore';
import { compileFind, type FindMatcher, type FindQuery } from './findQuery';
import { findMatches, type FindMatch, type TextMatch } from './findMatches';
import { ShownTexts } from './shownTexts';
import { holds, matchesIn, shownRange, windowAround, type DocWindow } from './findWindow';
import { currentMatch, findDecorations } from './findDecorations';
import { revealPosInCenter } from '../jumpReveal';

function selectionOn(state: EditorState, match: FindMatch): Selection {
	if (match.kind === 'unit') {
		try {
			return NodeSelection.create(state.doc, match.from);
		} catch {
			return TextSelection.near(state.doc.resolve(match.from));
		}
	}
	return TextSelection.create(state.doc, match.from, match.to);
}

class VisualFind {
	open = $state(false);
	matches = $state.raw<FindMatch[]>([]);
	/** the match the selection is on, -1 when it is on none */
	current = $state(-1);
	readonly unreplaceable = $derived(this.matches.filter((m) => m.kind === 'unit').length);
	/** true while find moves the selection: a formula or chip it lands on leaves the keyboard in the find field */
	movingSelection = false;
	#matcher: FindMatcher | null = null;
	/** the matches of the last document searched, so the decorations and the counts read one search */
	#searched: { doc: EditorState['doc']; matches: FindMatch[] } | null = null;
	#drawn: { doc: EditorState['doc']; matches: FindMatch[]; current: number; window: DocWindow; set: DecorationSet } | null = null;
	/** the stretch the tints cover, moved on as the pane scrolls past it */
	#window: DocWindow = { from: 0, to: 0 };
	#following: { view: EditorView; stop: () => void } | null = null;
	readonly #shown = new ShownTexts(
		(pos) => editorViewStore.current?.canvas.nodeText(pos) || null,
		() => {
			const view = editorViewStore.current;
			if (!this.open || !view) return;
			this.#searched = null;
			this.#refresh(view);
			view.dispatch(view.state.tr);
		}
	);

	#select(view: EditorView, tr: Transaction): void {
		this.movingSelection = true;
		try {
			view.dispatch(tr);
		} finally {
			this.movingSelection = false;
		}
		revealPosInCenter(view, view.state.selection.from, 'smooth');
	}

	setQuery(query: FindQuery): void {
		this.#matcher = compileFind(query);
		this.#searched = null;
		this.open = true;
		const view = editorViewStore.current;
		if (!view) return;
		this.#follow(view);
		this.#refresh(view);
		// the decorations are read again with the new query
		view.dispatch(view.state.tr);
	}

	/** keeps the tinted stretch around the pane of `view` */
	#follow(view: EditorView): void {
		if (this.#following?.view !== view) {
			this.#following?.stop();
			this.#following = { view, stop: view.canvas.onFrame(() => this.#scrolled(view)) };
		}
		this.#window = windowAround(shownRange(view), view.state.doc.content.size);
	}

	#scrolled(view: EditorView): void {
		if (!this.open) return;
		const shown = shownRange(view);
		if (holds(this.#window, shown)) return;
		this.#window = windowAround(shown, view.state.doc.content.size);
		// not inside the frame that drew the pane
		queueMicrotask(() => {
			if (this.open && !view.isDestroyed) view.dispatch(view.state.tr);
		});
	}

	close(): void {
		// a closed find has nothing drawn to take away; called from an effect, it must read and write nothing
		if (!this.open) return;
		this.open = false;
		this.#matcher = null;
		this.#shown.stop();
		this.#following?.stop();
		this.#following = null;
		this.matches = [];
		this.current = -1;
		this.#searched = null;
		const view = editorViewStore.current;
		if (view) view.dispatch(view.state.tr);
	}

	/** the find plugin's decorations: none while find is closed */
	decorations(state: EditorState): DecorationSet | null {
		// read during the view's update, which can run inside an effect: untracked, or the effect reruns on every frame
		return untrack(() => {
			const view = editorViewStore.current;
			if (!this.open || !view || view.state.doc !== state.doc) return null;
			const matches = this.#matchesOf(view);
			const current = currentMatch(state, matches);
			const drawn = this.#drawn;
			const window = this.#window;
			// the canvas asks once for each block it lays out
			if (drawn?.doc === state.doc && drawn.matches === matches && drawn.current === current && drawn.window === window) return drawn.set;
			const on = matches[current] ?? null;
			const set = findDecorations(matchesIn(matches, window, on), on, state.doc);
			this.#drawn = { doc: state.doc, matches, current, window, set };
			return set;
		});
	}

	#matchesOf(view: EditorView): FindMatch[] {
		const { doc } = view.state;
		if (this.#searched?.doc !== doc) {
			// reading a chip's drawn text can lay its block out, which asks for these decorations again
			this.#searched = { doc, matches: [] };
			this.#shown.follow(doc);
			this.#searched = { doc, matches: this.#matcher ? findMatches(doc, this.#matcher, (_, pos) => this.#shown.textAt(doc, pos)) : [] };
		}
		return this.#searched.matches;
	}

	/** after every update of an editor view: the counts follow the text and the selection */
	viewUpdated(view: EditorView): void {
		if (!this.open || view !== editorViewStore.current) return;
		this.#refresh(view);
	}

	step(dir: 1 | -1): void {
		const view = editorViewStore.current;
		if (!view || !this.matches.length) return;
		const { from } = view.state.selection;
		const next =
			dir === 1
				? (this.matches.find((m) => m.from > from) ?? this.matches[0])
				: ([...this.matches].reverse().find((m) => m.from < from) ?? this.matches[this.matches.length - 1]);
		this.#select(view, view.state.tr.setSelection(selectionOn(view.state, next)));
	}

	/** the text match under the selection, then on to the next; selects the next one first when on none */
	replaceOne(): void {
		const view = editorViewStore.current;
		const matcher = this.#matcher;
		if (!view || !matcher) return;
		const texts = this.matches.filter((m): m is TextMatch => m.kind === 'text');
		const { from, to } = view.state.selection;
		const here = texts.find((m) => m.from === from && m.to === to);
		if (!here) {
			const next = texts.find((m) => m.from >= from) ?? texts[0];
			if (next) this.#select(view, view.state.tr.setSelection(selectionOn(view.state, next)));
			return;
		}
		const tr = view.state.tr.insertText(matcher.replacementFor(view.state.doc.textBetween(here.from, here.to)), here.from, here.to);
		const after = texts.find((m) => m.from >= here.to);
		if (!after) return void view.dispatch(tr.scrollIntoView());
		this.#select(view, tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(after.from, 1), tr.mapping.map(after.to, -1))));
	}

	replaceAll(): void {
		const view = editorViewStore.current;
		const matcher = this.#matcher;
		if (!view || !matcher) return;
		const texts = this.matches.filter((m): m is TextMatch => m.kind === 'text');
		if (!texts.length) return;
		const tr = view.state.tr;
		// back to front, so the positions before each one stay where they were
		for (const m of [...texts].reverse()) tr.insertText(matcher.replacementFor(view.state.doc.textBetween(m.from, m.to)), m.from, m.to);
		view.dispatch(tr);
	}

	#refresh(view: EditorView): void {
		const matches = this.#matchesOf(view);
		if (matches !== this.matches) this.matches = matches;
		this.current = currentMatch(view.state, matches);
	}
}

export const visualFind = new VisualFind();
