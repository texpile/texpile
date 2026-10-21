// the visual editor's find and replace: matches, the one under the selection, stepping and replacing
import { NodeSelection, TextSelection, type EditorState, type Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { editorViewStore } from '$lib/stores/editorStore';
import { compileFind, type FindMatcher, type FindQuery } from './findQuery';
import { findMatches, type FindMatch, type ShownText, type TextMatch } from './findMatches';
import { clearFindHighlights, paintFindHighlights } from './findHighlights';

// a formula's drawing is in a shadow tree and reads as symbols, so its LaTeX is searched
function shownTextIn(view: EditorView): ShownText {
	return (node, pos) => (node.type.name.includes('math') ? null : view.nodeDOM(pos)?.textContent || null);
}

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

function centerSelection(view: EditorView): void {
	const coords = view.coordsAtPos(view.state.selection.from);
	const scroller = view.dom.closest<HTMLElement>('.overflow-y-auto');
	if (!scroller) return;
	const box = scroller.getBoundingClientRect();
	scroller.scrollTo({ top: coords.top - box.top + scroller.scrollTop - box.height / 2, behavior: 'smooth' });
}

class VisualFind {
	open = $state(false);
	matches = $state.raw<FindMatch[]>([]);
	/** the match the selection is on, -1 when it is on none */
	current = $state(-1);
	readonly unreplaceable = $derived(this.matches.filter((m) => m.kind === 'unit').length);
	#matcher: FindMatcher | null = null;

	setQuery(query: FindQuery): void {
		this.#matcher = compileFind(query);
		this.open = true;
		const view = editorViewStore.current;
		if (view) this.#refresh(view, true);
	}

	close(): void {
		this.open = false;
		this.#matcher = null;
		this.matches = [];
		this.current = -1;
		const view = editorViewStore.current;
		if (view) clearFindHighlights(view);
	}

	/** after every update of an editor view: the text moved, or ProseMirror redrew what the highlights point at */
	viewUpdated(view: EditorView, docChanged: boolean): void {
		if (!this.open || view !== editorViewStore.current) return;
		this.#refresh(view, docChanged);
	}

	step(dir: 1 | -1): void {
		const view = editorViewStore.current;
		if (!view || !this.matches.length) return;
		const { from } = view.state.selection;
		const next =
			dir === 1
				? (this.matches.find((m) => m.from > from) ?? this.matches[0])
				: ([...this.matches].reverse().find((m) => m.from < from) ?? this.matches[this.matches.length - 1]);
		view.dispatch(view.state.tr.setSelection(selectionOn(view.state, next)).scrollIntoView());
		centerSelection(view);
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
			if (next) view.dispatch(view.state.tr.setSelection(selectionOn(view.state, next)).scrollIntoView());
			return;
		}
		const tr = view.state.tr.insertText(matcher.replacementFor(view.state.doc.textBetween(here.from, here.to)), here.from, here.to);
		const after = texts.find((m) => m.from >= here.to);
		if (after) tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(after.from, 1), tr.mapping.map(after.to, -1)));
		view.dispatch(tr.scrollIntoView());
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

	#refresh(view: EditorView, rematch: boolean): void {
		if (rematch) this.matches = this.#matcher ? findMatches(view.state.doc, this.#matcher, shownTextIn(view)) : [];
		const { from, to } = view.state.selection;
		this.current = this.matches.findIndex((m) => m.from === from && m.to === to);
		paintFindHighlights(view, this.matches, this.current);
	}
}

export const visualFind = new VisualFind();
