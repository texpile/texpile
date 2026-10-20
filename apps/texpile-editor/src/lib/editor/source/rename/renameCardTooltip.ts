import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { showTooltip, type EditorView as CMView, type Tooltip } from '@codemirror/view';
import { mount, unmount } from 'svelte';
import RenameCard from './RenameCard.svelte';

export type RenameCardRequest = {
	/** where the renamed token starts */
	from: number;
	title: string;
	name: string;
	/** why the name cannot be used, null when it can */
	problemOf: (name: string) => string | null;
	onRename: (name: string) => void;
};

const setCard = StateEffect.define<Tooltip | null>();

function inputOf(view: CMView): HTMLInputElement | null {
	return view.dom.ownerDocument.querySelector('.cm-rename-card input');
}

function cardTooltip(view: CMView, request: RenameCardRequest): Tooltip {
	function close() {
		if (!view.state.field(cardField, false)) return;
		view.dispatch({ effects: setCard.of(null) });
		view.focus();
	}
	return {
		pos: request.from,
		above: false,
		create() {
			const dom = document.createElement('div');
			dom.className = 'cm-rename-card';
			const card = mount(RenameCard, {
				target: dom,
				props: {
					title: request.title,
					name: request.name,
					problemOf: request.problemOf,
					onRename(name) {
						close();
						if (name !== request.name) request.onRename(name);
					},
					onCancel: close
				}
			});
			return {
				dom,
				mount() {
					inputOf(view)?.focus();
					inputOf(view)?.select();
				},
				destroy: () => void unmount(card)
			};
		}
	};
}

const cardField = StateField.define<Tooltip | null>({
	create: () => null,
	update(tooltip, tr) {
		for (const effect of tr.effects) if (effect.is(setCard)) return effect.value;
		return tooltip && tr.docChanged ? { ...tooltip, pos: tr.changes.mapPos(tooltip.pos) } : tooltip;
	},
	provide: (field) => showTooltip.from(field)
});

export const renameCard: Extension = cardField;

export function renameCardOpen(state: EditorState): boolean {
	return !!state.field(cardField, false);
}

/** the small card anchored at the renamed token; selects its field when one is already open */
export function openRenameCard(view: CMView, request: RenameCardRequest): void {
	const input = inputOf(view);
	if (view.state.field(cardField, false) && input) {
		input.select();
		return;
	}
	view.dispatch({ effects: setCard.of(cardTooltip(view, request)) });
}
