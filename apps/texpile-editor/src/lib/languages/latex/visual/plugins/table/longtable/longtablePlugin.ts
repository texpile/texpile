import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { m } from '$lib/paraglide/messages';
import type { LongtableMarker } from './longtableMarkers';
import { markerLinesOf, sectionOfRow } from './longtableSections';
import './longtable.css';

const MARKER_LABELS: Record<LongtableMarker, () => string> = {
	endfirsthead: () => m.longtable_end_first_head(),
	endhead: () => m.longtable_end_head(),
	endfoot: () => m.longtable_end_foot(),
	endlastfoot: () => m.longtable_end_last_foot()
};

function markerRow(marker: LongtableMarker, columns: number): HTMLElement {
	const row = document.createElement('tr');
	row.className = 'longtable-marker';
	const cell = row.appendChild(document.createElement('td'));
	cell.colSpan = columns;
	cell.textContent = MARKER_LABELS[marker]();
	return row;
}

function decorateTable(table: Node, at: number, caption: Node | null, out: Decoration[]): void {
	const lines = markerLinesOf(table, caption);
	if (lines.length === 0) return;
	const columns = TableMap.get(table).width;
	const starts: number[] = [];
	table.forEach((row, offset, i) => {
		starts.push(at + 1 + offset);
		const section = sectionOfRow(lines, i);
		if (section !== 'body') out.push(Decoration.node(at + 1 + offset, at + 1 + offset + row.nodeSize, { class: `longtable-${section}` }));
	});
	starts.push(at + 1 + table.content.size);
	lines.forEach((line, i) => {
		out.push(
			Decoration.widget(starts[line.before], () => markerRow(line.marker, columns), {
				side: -1,
				ignoreSelection: true,
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

/** a longtable's repeating head and foot drawn as such: head rows as header rows, and a quiet labeled line where each section ends */
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
