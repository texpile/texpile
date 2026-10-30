import type { FigureStatement, StatementInfo } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';
import { ancestry } from './statementTree';

export type ObjectListRow = {
	st: FigureStatement;
	depth: number;
	/** the label the user gave it, a node's text, else what it is */
	name: string;
	title: string;
	scope: boolean;
	open: boolean;
	selected: boolean;
	hidden: boolean;
	locked: boolean;
	/** hidden or locked by the scope it is in */
	inherited: boolean;
	/** the engine could not draw it, and drew the rest without it */
	failed: boolean;
};

function nameOf(ed: FigureEditorState, st: FigureStatement, { title, text, name }: StatementInfo) {
	const label = ed.language.readLabel(ed.source, st);
	if (label) return label;
	const shown = text ? (ed.language.readText(ed.source, st) ?? '').replace(/\s+/g, ' ').trim() : '';
	const full = shown || name;
	return full ? (full.length > 40 ? `${full.slice(0, 39)}…` : full) : title;
}

/** the picture's statements as list rows, in written order; a collapsed scope's are left out unless one is selected */
export function objectRows(ed: FigureEditorState, collapsed: ReadonlySet<number>): ObjectListRow[] {
	const { tree, flags } = ed;
	const failed = new Set(ed.drawingMatchesText ? ed.render.failed : []);
	const kept = new Set(ed.selection.flatMap((i) => ancestry(tree, i).slice(1)));
	const rows: ObjectListRow[] = [];
	function walk(parent: number, depth: number) {
		for (const i of tree.children.get(parent) ?? []) {
			const st = tree.byId.get(i)!;
			if (st.kind === 'frame') continue;
			const described = ed.language.describe(ed.source, st);
			// an axis holds its plots as a scope holds its statements, and a branch its children
			const scope = st.kind === 'scope' || st.kind === 'axis' || (st.kind === 'branch' && !!tree.children.get(i)?.length);
			const open = scope && (!collapsed.has(i) || kept.has(i));
			const hidden = flags.hidden.includes(i);
			const locked = flags.locked.includes(i);
			rows.push({
				st,
				depth,
				name: nameOf(ed, st, described),
				title: described.title,
				scope,
				open,
				selected: ed.selection.includes(i),
				hidden,
				locked,
				inherited: (!hidden && flags.hiddenAll.has(i)) || (!locked && flags.lockedAll.has(i)),
				failed: failed.has(i)
			});
			if (open) walk(i, depth + 1);
		}
	}
	walk(0, 0);
	return rows;
}
