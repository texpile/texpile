import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { setLook, type CanvasWidget, type StyleLook } from '$lib/editor/canvas';
import { m } from '$lib/paraglide/messages';
import type { LongtableMarker } from './longtableMarkers';
import { markerLinesOf, sectionOfRow } from './longtableSections';

const MARKER_LABELS: Record<LongtableMarker, () => string> = {
	endfirsthead: () => m.longtable_end_first_head(),
	endhead: () => m.longtable_end_head(),
	endfoot: () => m.longtable_end_foot(),
	endlastfoot: () => m.longtable_end_last_foot()
};

const MARKER_LOOK: StyleLook = {
	padding: '0 calc(var(--spacing) * 2)',
	border: 'none',
	borderTop: '1px dashed light-dark(var(--color-surface-300), var(--color-surface-700))',
	backgroundColor: 'transparent',
	color: 'var(--faint-text)',
	fontSize: '0.6875rem',
	lineHeight: '1rem',
	textAlign: 'right'
};
// a head row's words in bold and a foot row's muted, as the section's own rows print them
const SECTION_STYLES: Record<string, string> = { head: 'font-weight: 600', foot: 'color: var(--muted-text)' };

function markerForm(marker: LongtableMarker, columns: number): CanvasWidget {
	return {
		kind: 'tableRow',
		build(ctx) {
			const row = ctx.el('tr', 'longtable-marker');
			const cell = row.appendChild(ctx.el('td', undefined, MARKER_LABELS[marker]()));
			cell.setAttribute('colspan', String(columns));
			setLook(cell, MARKER_LOOK);
			return row;
		}
	};
}

function decorateTable(table: Node, at: number, caption: Node | null, out: Decoration[]): void {
	const lines = markerLinesOf(table, caption);
	if (lines.length === 0) return;
	const columns = TableMap.get(table).width;
	const starts: number[] = [];
	table.forEach((row, offset, i) => {
		starts.push(at + 1 + offset);
		const section = sectionOfRow(lines, i);
		if (section !== 'body')
			out.push(
				Decoration.node(at + 1 + offset, at + 1 + offset + row.nodeSize, {
					class: `longtable-${section}`,
					style: SECTION_STYLES[section] ?? ''
				})
			);
	});
	starts.push(at + 1 + table.content.size);
	lines.forEach((line, i) => {
		out.push(
			Decoration.widget(starts[line.before], () => document.createElement('tr'), {
				side: -1,
				ignoreSelection: true,
				canvas: markerForm(line.marker, columns),
				key: `longtable-${line.marker}-${line.before}-${columns}-${i}`
			})
		);
	});
}

function collect(parent: Node, offset: number, out: Decoration[]): void {
	parent.forEach((child, at) => {
		const pos = offset + at;
		if (child.type.name === 'table_wrapper') {
			const table = child.childCount > 1 ? child.child(1) : null;
			if (table?.type.name === 'table' && table.attrs.env === 'longtable')
				decorateTable(table, pos + 1 + child.child(0).nodeSize, child.child(0), out);
		} else if (child.type.name === 'table') {
			if (child.attrs.env === 'longtable') decorateTable(child, pos, null, out);
		} else if (!child.isTextblock && child.childCount > 0) collect(child, pos + 1, out);
	});
}

function decorationsOf(doc: Node): DecorationSet {
	const decorations: Decoration[] = [];
	collect(doc, 0, decorations);
	return DecorationSet.create(doc, decorations);
}

const longtableKey = new PluginKey<DecorationSet>('longtable');

export function longtablePlugin(): Plugin {
	return new Plugin({
		key: longtableKey,
		state: {
			init: (_config, state) => decorationsOf(state.doc),
			apply: (tr, old) => (tr.docChanged ? decorationsOf(tr.doc) : old)
		},
		props: {
			decorations: (state) => longtableKey.getState(state)
		}
	});
}
