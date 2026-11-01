// only on the picture the caret is in, so a paper full of pictures stays quiet
import { syntaxTree } from '@codemirror/language';
import { StateEffect, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { unavailableTip } from '$lib/components/tooltip.svelte';
import { m } from '$lib/paraglide/messages';
import { samePath } from '$lib/workspace/fileSystem';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { finderFor, isTypstFile } from '../anchor/pictureFinders';
import { figuresOn, onFiguresChange } from '../anchor/openFigures.svelte';
import { OPEN_FIGURE_AT, type OpenFigureAtDetail } from '../card/figureEvents';
import { pictureStartAt } from './pictureAtCaret';

const FIGURES_CHANGED = StateEffect.define<null>();

class EditFigureChip extends WidgetType {
	private stopTip: (() => void) | undefined;

	constructor(
		readonly path: string,
		readonly from: number
	) {
		super();
	}
	override eq(other: EditFigureChip): boolean {
		return other.path === this.path && other.from === this.from;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(view: EditorView): HTMLElement {
		const chip = document.createElement('button');
		chip.className = 'cm-figure-chip text-muted hover:text-primary-ink cursor-pointer text-xs transition-colors';
		chip.textContent = m.figure_edit();
		chip.addEventListener('mousedown', (e) => e.preventDefault());
		if (workspaceRoot.current === GUEST_ROOT) {
			chip.classList.add('opacity-50');
			chip.setAttribute('aria-disabled', 'true');
			this.stopTip = unavailableTip(chip, m.unavailable_guest())?.destroy;
			return chip;
		}
		chip.addEventListener('click', () => {
			view.focus();
			const detail: OpenFigureAtDetail = { path: this.path, from: this.from };
			window.dispatchEvent(new CustomEvent(OPEN_FIGURE_AT, { detail }));
		});
		return chip;
	}
	override destroy(): void {
		this.stopTip?.();
	}
	override ignoreEvent(): boolean {
		return true;
	}
}

function chipAt(state: EditorState, path: string): DecorationSet {
	const from = pictureStartAt(state, state.selection.main.head, isTypstFile(path));
	if (from === null || figuresOn(path, samePath).some(([, f]) => f.picture?.from === from)) return Decoration.none;
	if (!finderFor(path).at(state.doc.toString(), from)) return Decoration.none;
	const chip = Decoration.widget({ widget: new EditFigureChip(path, from), side: 1 });
	return Decoration.set(chip.range(state.doc.lineAt(from).to));
}

export function editFigureChip(path: string): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			stop: () => void;

			constructor(view: EditorView) {
				this.decorations = chipAt(view.state, path);
				this.stop = onFiguresChange(() =>
					queueMicrotask(() => {
						if (view.dom.isConnected) view.dispatch({ effects: FIGURES_CHANGED.of(null) });
					})
				);
			}

			update(u: ViewUpdate) {
				const figures = u.transactions.some((t) => t.effects.some((e) => e.is(FIGURES_CHANGED)));
				if (figures || u.docChanged || u.selectionSet || syntaxTree(u.startState) !== syntaxTree(u.state)) {
					this.decorations = chipAt(u.state, path);
				}
			}

			destroy() {
				this.stop();
			}
		},
		{ decorations: (plugin) => plugin.decorations }
	);
}
