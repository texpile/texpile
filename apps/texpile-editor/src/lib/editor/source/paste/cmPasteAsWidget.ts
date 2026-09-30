// The button left after a paste that could have gone another way, as VS Code leaves one. It lists
// the paste's other readings; picking one rewrites the pasted text in place. It goes once the text
// is edited or the caret leaves it.
import { EditorView as CMView, keymap, showTooltip, type Tooltip, type TooltipView } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { mount, unmount } from 'svelte';
import { showContextMenu } from '$lib/menus/contextMenu.svelte';
import type { SourcePasteKind } from './sourcePasteOptions';
import PasteAsButton from './PasteAsButton.svelte';

export type PasteReading = {
	kind: SourcePasteKind;
	label: string;
	text: string;
	/** runs once the reading is written: a LaTeX link offers hyperref */
	written?: () => void;
};

/** a paste still open to another reading: where its text is, and which reading that text is (none yet from the palette) */
export type OpenPaste = { from: number; to: number; readings: PasteReading[]; current: SourcePasteKind | null };

export const setOpenPaste = StateEffect.define<OpenPaste | null>();

/** replace the pasted text with `reading`, keeping the others on offer; each reading is an undo step of its own */
export function choosePasteReading(view: CMView, paste: OpenPaste, reading: PasteReading): void {
	const to = paste.from + reading.text.length;
	view.dispatch({
		changes: { from: paste.from, to: paste.to, insert: reading.text },
		selection: { anchor: to },
		effects: setOpenPaste.of(paste.readings.length > 1 ? { ...paste, to, current: reading.kind } : null),
		annotations: isolateHistory.of('full'),
		userEvent: 'input.paste',
		scrollIntoView: true
	});
	reading.written?.();
	view.focus();
}

/** the readings other than the one showing, as menu items */
export function showPasteReadings(view: CMView, paste: OpenPaste, at: { x: number; y: number }): void {
	const doc = view.state.doc;
	const items = paste.readings
		.filter((reading) => reading.kind !== paste.current)
		.map((reading) => ({
			label: reading.label,
			// the range is from when the menu opened: once the text changes it could name other text
			onclick: () => {
				if (view.state.doc === doc) choosePasteReading(view, paste, reading);
			}
		}));
	void showContextMenu(items, at, { onClose: () => view.focus() });
}

function pasteAsTooltip(paste: OpenPaste): Tooltip {
	return {
		pos: paste.to,
		above: false,
		create(view): TooltipView {
			const dom = document.createElement('div');
			dom.className = 'cm-paste-as';
			const button = mount(PasteAsButton, { target: dom, props: { onOpen: (at) => showPasteReadings(view, paste, at) } });
			return { dom, offset: { x: 0, y: 2 }, destroy: () => void unmount(button) };
		}
	};
}

const openPaste = StateField.define<{ paste: OpenPaste; tooltip: Tooltip } | null>({
	create: () => null,
	update(value, tr) {
		for (const effect of tr.effects)
			if (effect.is(setOpenPaste)) return effect.value && { paste: effect.value, tooltip: pasteAsTooltip(effect.value) };
		if (!value || tr.docChanged) return null;
		const { head } = tr.state.selection.main;
		return head < value.paste.from || head > value.paste.to ? null : value;
	},
	provide: (field) => showTooltip.from(field, (value) => value?.tooltip ?? null)
});

const dismissOnEscape = keymap.of([
	{
		key: 'Escape',
		run(view) {
			if (!view.state.field(openPaste)) return false;
			view.dispatch({ effects: setOpenPaste.of(null) });
			return true;
		}
	}
]);

const pasteAsTheme = CMView.baseTheme({
	'.cm-tooltip.cm-paste-as': { padding: '1px', borderRadius: '0.375rem' }
});

export function pasteAsWidget(): Extension {
	return [openPaste, dismissOnEscape, pasteAsTheme];
}
