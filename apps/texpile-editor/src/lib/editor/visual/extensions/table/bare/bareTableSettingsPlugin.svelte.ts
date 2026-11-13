// settings for a table that stands outside a float: its columns, and the way into a float with a caption and a number
import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import { TextSelection, type Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { blockSettingsPlugin, gearPlaceBeside, type GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { generateLabel } from '$lib/editor/visual/label';
import { tableLookOf, type TableLines } from '../rules/tableRules';
import { withColumnSizes } from '../columns/typstColumnSizes';
import { m } from '$lib/paraglide/messages';
import BareTableSettings from './BareTableSettings.svelte';

export type TableSide = 'left' | 'center' | 'right';

/** the block holding only the table that sets its side: an alignment environment, an #align */
export type TableHolder = {
	pos: number;
	sideOf(holder: Node): TableSide | null;
	withSide(holder: Node, side: TableSide): Node['attrs'] | null;
};

export type BareTableRequest = {
	view: EditorView;
	/** where the table node stands */
	pos: number;
	dialect: 'latex' | 'typst';
	place: GearPlace;
	/** its sides show among the settings, and the float takes its place */
	holder?: TableHolder;
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
	const { view, pos, dialect, holder } = request;
	const table = tableAt(view, pos);
	if (!table) return;

	function holderNode(): Node | null {
		return holder ? view.state.doc.nodeAt(holder.pos) : null;
	}
	function sideNow(): TableSide | null {
		const node = holderNode();
		return holder && node ? holder.sideOf(node) : null;
	}
	const props = $state({
		place: request.place,
		dialect,
		table: table as Node | null,
		colspec: String(table.attrs.colspec ?? ''),
		tableEnv: String(table.attrs.env ?? 'tabular'),
		held: !!holder,
		side: sideNow(),
		setColspec(spec: string) {
			const now = tableAt(view, pos);
			if (!now) return;
			view.dispatch(
				dialect === 'latex'
					? view.state.tr.setNodeMarkup(pos, undefined, { ...now.attrs, colspec: spec, env: now.attrs.env ?? 'tabular' })
					: withColumnSizes(view.state.tr, pos, spec)
			);
			props.table = tableAt(view, pos);
			props.colspec = spec;
		},
		setAlign(align: string | null) {
			const now = tableAt(view, pos);
			if (!now) return;
			view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...now.attrs, typAlign: align }));
			props.table = tableAt(view, pos);
		},
		lines: tableLookOf(view.state)?.linesOf(table) ?? null,
		setLines(lines: TableLines) {
			tableLookOf(view.state)?.setLines(view, pos, lines);
			const now = tableAt(view, pos);
			if (!now) return;
			props.table = now;
			props.colspec = String(now.attrs.colspec ?? '');
			props.tableEnv = String(now.attrs.env ?? 'tabular');
			props.lines = tableLookOf(view.state)?.linesOf(now) ?? null;
		},
		setSide(side: TableSide) {
			const node = holderNode();
			const attrs = holder && node ? holder.withSide(node, side) : null;
			if (!holder || !attrs) return;
			view.dispatch(view.state.tr.setNodeMarkup(holder.pos, undefined, attrs));
			props.side = sideNow();
		},
		makeFloat() {
			const now = tableAt(view, pos);
			const around = holderNode();
			if (!now) return;
			const from = holder && around ? holder.pos : pos;
			const to = from + (around ?? now).nodeSize;
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
		// a float's table has the float's settings
		if (!tableAt(view, pos) || view.state.doc.resolve(pos).parent.type.name === 'table_wrapper') return null;
		return {
			label: () => m.tablewrap_settings_button(),
			open(gear) {
				const dom = view.nodeDOM(pos);
				if (dom instanceof Element) openBareTableSettings({ view, pos, dialect, place: gearPlaceBeside(dom, gear) });
			}
		};
	});
}
