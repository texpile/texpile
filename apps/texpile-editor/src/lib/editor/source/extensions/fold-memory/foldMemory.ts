// the source editor's folds, kept with the file's place (docPositions) and folded again when the file opens. A fold is
// kept by its first line, so a file changed on disk since still folds the line it was on
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, foldState, unfoldEffect } from '@codemirror/language';
import type { EditorState, StateEffect } from '@codemirror/state';
import { docPositions, type SavedFold } from '$lib/workspace/docPositions';
import { trailingDebounce } from '$lib/trailingDebounce';

// a fold the language cannot give yet (the Typst parser is a lazy import, and its text arrives after the editor) is
// tried again as the editor updates, for this long
const RESTORE_FOR_MS = 20_000;
// enough of a line to tell it from the others, without a minified line filling the store
const TEXT_KEPT = 200;
const MAX_FOLDS = 100;

/** the line a saved fold starts on: its own row while that still reads the same, else the nearest line that does */
function lineOf(state: EditorState, fold: SavedFold): number | null {
	const { doc } = state;
	const own = fold.row + 1;
	if (own <= doc.lines && doc.line(own).text.slice(0, TEXT_KEPT) === fold.text) return own;
	// a blank line is no clue to where the fold went
	if (!fold.text.trim()) return null;
	let best: number | null = null;
	let n = 0;
	for (const text of doc.iterLines()) {
		n++;
		if (text.slice(0, TEXT_KEPT) === fold.text && (best === null || Math.abs(n - own) < Math.abs(best - own))) best = n;
	}
	return best;
}

export function foldMemory(path: string) {
	return ViewPlugin.fromClass(
		class {
			/** saved folds not folded again yet; null once none are left */
			private pending: SavedFold[] | null;
			private readonly restoreUntil = Date.now() + RESTORE_FOR_MS;
			private restoring = false;
			private restoreQueued = false;
			private saved: string;
			private readonly saveLater = trailingDebounce<void>(400, () => this.save());

			constructor(private readonly view: EditorView) {
				const folds = docPositions.get(path)?.folds ?? [];
				this.saved = JSON.stringify(folds);
				this.pending = folds.length ? [...folds] : null;
				this.queueRestore();
			}

			/** never dispatching from inside the editor's own construction or update */
			private queueRestore(): void {
				if (!this.pending || this.restoreQueued) return;
				this.restoreQueued = true;
				queueMicrotask(() => {
					this.restoreQueued = false;
					this.restore();
				});
			}

			private restore(): void {
				if (!this.pending) return;
				if (Date.now() > this.restoreUntil) return void (this.pending = null);
				const { state } = this.view;
				const head = state.selection.main.head;
				const effects: StateEffect<unknown>[] = [];
				const starts = new Set<number>();
				const left: SavedFold[] = [];
				for (const fold of this.pending) {
					const n = lineOf(state, fold);
					const line = n === null ? null : state.doc.line(n);
					const range = line && foldable(state, line.from, line.to);
					if (!range) left.push(fold);
					// the caret already inside stays: a fold opens wherever the caret is
					else if (!(head > range.from && head < range.to) && !starts.has(range.from)) {
						starts.add(range.from);
						effects.push(foldEffect.of(range));
					}
				}
				this.pending = left.length ? left : null;
				if (!effects.length) return;
				this.restoring = true;
				this.view.dispatch({ effects });
				this.restoring = false;
			}

			private save(): void {
				const { state } = this.view;
				const folds: SavedFold[] = [];
				const rows = new Set<number>();
				foldedRanges(state).between(0, state.doc.length, (from) => {
					const line = state.doc.lineAt(from);
					if (rows.has(line.number)) return;
					rows.add(line.number);
					folds.push({ row: line.number - 1, text: line.text.slice(0, TEXT_KEPT) });
				});
				// still waiting on the language: kept, so a slow parse does not cost the reader their folds
				const all = [...folds, ...(this.pending ?? [])].slice(0, MAX_FOLDS);
				const json = JSON.stringify(all);
				if (json === this.saved) return;
				this.saved = json;
				docPositions.setFolds(path, all);
			}

			update(u: ViewUpdate): void {
				// folded or unfolded (the gutter, the keyboard, the caret going in), not folds an edit only carried along
				const refolded =
					u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))) ||
					(!u.docChanged && u.startState.field(foldState, false) !== u.state.field(foldState, false));
				if (refolded && !this.restoring) {
					// the reader folding or unfolding by hand settles what is folded; what never came back is let go
					this.pending = null;
					this.saveLater.cancel();
					this.save();
				} else if (u.docChanged && (foldedRanges(u.state).size || foldedRanges(u.startState).size)) this.saveLater();
				this.queueRestore();
			}

			destroy(): void {
				this.saveLater.cancel();
				this.save();
			}
		}
	);
}
