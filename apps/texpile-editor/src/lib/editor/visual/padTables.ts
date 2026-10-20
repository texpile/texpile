// uneven table rows padded at parse, as the view pads them on mount
import { EditorState } from 'prosemirror-state';
import { fixTables, TableMap, tableNodeTypes } from 'prosemirror-tables';
import type { Node as PMNode } from 'prosemirror-model';
import { blockSpanOf, noteBlockSpan } from './sourceSpans';

// fixTables puts a lone short first row's cells at its front, TeX leaves them at the end
function padRowEnds(state: EditorState): EditorState {
	const adds: { at: number; n: number; role: 'cell' | 'header_cell' }[] = [];
	state.doc.descendants((table, tablePos) => {
		if (table.type.spec.tableRole !== 'table') return;
		const rowEnds: number[] = [];
		let end = tablePos + 1;
		table.forEach((row) => rowEnds.push((end += row.nodeSize) - 1));
		for (const problem of TableMap.get(table).problems ?? []) {
			if (problem.type !== 'missing') continue;
			const role = table.child(problem.row).firstChild?.type.spec.tableRole === 'header_cell' ? 'header_cell' : 'cell';
			adds.push({ at: rowEnds[problem.row], n: problem.n, role });
		}
	});
	if (!adds.length) return state;
	const tr = state.tr;
	const types = tableNodeTypes(state.schema);
	for (const { at, n, role } of adds) {
		const cells = Array.from({ length: n }, () => types[role].createAndFill()!);
		tr.insert(tr.mapping.map(at), cells);
	}
	return state.apply(tr.setMeta('addToHistory', false));
}

export function padTablesInState(initial: EditorState): EditorState {
	const state = padRowEnds(initial);
	const fix = fixTables(state);
	return fix ? state.apply(fix.setMeta('addToHistory', false)) : state;
}

export function padTables(doc: PMNode): PMNode {
	const padded = padTablesInState(EditorState.create({ schema: doc.type.schema, doc })).doc;
	if (padded === doc) return doc;
	// the padding rebuilds a table's block, which is still the block the parser placed: its span
	// goes with it (padding adds cells, never blocks, so the children still line up)
	if (padded.childCount === doc.childCount) {
		for (let i = 0; i < doc.childCount; i++) {
			const before = doc.child(i);
			const after = padded.child(i);
			if (after !== before && !blockSpanOf(after)) noteBlockSpan(after, blockSpanOf(before));
		}
	}
	return padded;
}
