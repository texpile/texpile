import type { FigureStatement, StatementInfo } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';
import { ancestry } from './statementTree';

export type ObjectListRow = {
	st: FigureStatement;
	depth: number;
	name: string;
	kind: string;
	title: string;
	scope: boolean;
	open: boolean;
	selected: boolean;
	hidden: boolean;
	locked: boolean;
	inherited: boolean;
	failed: boolean;
};

function nameOf(ed: FigureEditorState, st: FigureStatement, { title, text, name }: StatementInfo) {
	const label = ed.language.readLabel(ed.source, st);
	if (label) return label;
	const shown = text ? (ed.language.readText(ed.source, st) ?? '').replace(/\s+/g, ' ').trim() : '';
	const full = shown || name;
	return full ? (full.length > 40 ? `${full.slice(0, 39)}…` : full) : title;
}

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
			// CeTZ's `import cetz.draw: *` draws nothing
			if (described.kind === 'import') continue;
			const scope = st.kind === 'scope' || st.kind === 'axis' || (st.kind === 'branch' && !!tree.children.get(i)?.length);
			const open = scope && (!collapsed.has(i) || kept.has(i));
			const hidden = flags.hidden.includes(i);
			const locked = flags.locked.includes(i);
			rows.push({
				st,
				depth,
				name: nameOf(ed, st, described),
				kind: described.kind,
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
