// settings for a table that stands outside a float: its columns, and the way into a float with a caption and a number
import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import { TextSelection, type Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { blockSettingsPlugin, gearPlaceBeside, type GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { generateLabel } from '$lib/editor/visual/label';
import { m } from '$lib/paraglide/messages';
import BareTableSettings from './BareTableSettings.svelte';

export type BareTableRequest = {
	view: EditorView;
	/** where the table node stands */
	pos: number;
	dialect: 'latex' | 'typst';
	place: GearPlace;
	/** the alignment environment holding only this table: it shows its sides, and the float takes its place */
	around?: number;
};

let closeOpen: (() => void) | null = null;

function tableAt(view: EditorView, pos: number): Node | null {
	const node = view.state.doc.nodeAt(pos);
	return node?.type.name === 'table' ? node : null;
}

// LaTeX numbers a table by its caption, so a new float starts with words to type over; Typst numbers it without
function floatOf(view: EditorView, table: Node, dialect: 'latex' | 'typst'): Node {
	const { nodes } = view.state.schema;
	const parts =
		dialect === 'latex'
			? [nodes.table_caption.create(null, view.state.schema.text('Table caption')), table, nodes.table_notes.create()]
			: [nodes.table_caption.create(), table];
	return nodes.table_wrapper.create({ label: generateLabel('table'), showNotes: false }, parts);
}

export function closeBareTableSettings(): void {
	closeOpen?.();
}

export function openBareTableSettings(request: BareTableRequest): void {
	closeBareTableSettings();
	const { view, pos, dialect, around } = request;
	const table = tableAt(view, pos);
	if (!table) return;

	function environment(): Node | null {
		return around === undefined ? null : view.state.doc.nodeAt(around);
	}
	const props = $state({
		place: request.place,
		dialect,
		table: table as Node | null,
		colspec: String(table.attrs.colspec ?? ''),
		tableEnv: String(table.attrs.env ?? 'tabular'),
		alignment: around === undefined ? null : String(environment()?.attrs.name ?? ''),
		setColspec(spec: string) {
			const now = tableAt(view, pos);
			if (!now) return;
			const attrs =
				dialect === 'latex' ? { ...now.attrs, colspec: spec, env: now.attrs.env ?? 'tabular' } : { ...now.attrs, colspec: spec };
			view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
			props.table = tableAt(view, pos);
			props.colspec = spec;
		},
		setAlignment(name: string) {
			const env = environment();
			if (!env || around === undefined) return;
			view.dispatch(view.state.tr.setNodeMarkup(around, undefined, { ...env.attrs, name }));
			props.alignment = name;
		},
		makeFloat() {
			const now = tableAt(view, pos);
			const env = environment();
			if (!now) return;
			const from = env && around !== undefined ? around : pos;
			const to = from + (env ?? now).nodeSize;
			const tr = view.state.tr.replaceWith(from, to, floatOf(view, now, dialect));
			// the caret in the caption, over the words LaTeX starts it with
			const caption = tr.doc.nodeAt(from)!.firstChild!;
			tr.setSelection(TextSelection.create(tr.doc, from + 2, from + 2 + caption.content.size));
			closeBareTableSettings();
			view.dispatch(tr.scrollIntoView());
			view.focus();
		},
		onclose: closeBareTableSettings
	});
	const app = mount(BareTableSettings, { target: view.dom.ownerDocument.body, props });
	closeOpen = () => {
		closeOpen = null;
		void unmount(app);
	};
}

/** the handle's gear for a table that is a block of its own */
export function bareTableSettingsPlugin(dialect: 'latex' | 'typst'): Plugin {
	return blockSettingsPlugin((view, pos) => {
		if (!tableAt(view, pos)) return null;
		return {
			label: () => m.tablewrap_settings_button(),
			open(gear) {
				const dom = view.nodeDOM(pos);
				if (dom instanceof Element) openBareTableSettings({ view, pos, dialect, place: gearPlaceBeside(dom, gear) });
			}
		};
	});
}
