import { codeFolding, foldEffect, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import type { EditorState, Extension, Text } from '@codemirror/state';
import { keymap, ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { CodeFold } from '../figure/figureLanguage';

/** the code pane's collapsible regions, as the language finds them, and the ones that start collapsed, each once: one
 *  opened stays open while it is edited, and one the canvas adds (a helper, a style) starts collapsed in turn */
export function cmFolding(foldRanges: (source: string) => CodeFold[]): Extension[] {
	const found = new WeakMap<Text, CodeFold[]>();
	function foldsOf(state: EditorState) {
		let folds = found.get(state.doc);
		if (!folds) found.set(state.doc, (folds = foldRanges(state.doc.toString()).filter((f) => f.to > f.from)));
		return folds;
	}
	const collapse = ViewPlugin.fromClass(
		class {
			seen = new Set<string>();
			constructor(view: EditorView) {
				this.fold(view);
			}
			update(u: ViewUpdate) {
				if (u.docChanged) this.fold(u.view);
			}
			fold(view: EditorView) {
				const fresh = foldsOf(view.state).filter((f) => f.collapsed && !this.seen.has(f.label ?? ''));
				for (const f of fresh) this.seen.add(f.label ?? '');
				// an update may not dispatch while it runs
				if (fresh.length) queueMicrotask(() => view.dispatch({ effects: fresh.map((f) => foldEffect.of({ from: f.from, to: f.to })) }));
			}
		}
	);
	return [
		foldService.of((state, lineStart, lineEnd) => {
			const f = foldsOf(state).find((f) => f.from >= lineStart && f.from <= lineEnd);
			return f ? { from: f.from, to: f.to } : null;
		}),
		codeFolding({
			preparePlaceholder: (state, range) => foldsOf(state).find((f) => f.from === range.from && f.to === range.to)?.label ?? null,
			placeholderDOM(_view, onclick, label: string | null) {
				const chip = document.createElement('span');
				chip.className = 'cm-foldPlaceholder';
				chip.textContent = label ?? '…';
				chip.onclick = onclick;
				return chip;
			}
		}),
		foldGutter(),
		keymap.of(foldKeymap),
		collapse
	];
}
