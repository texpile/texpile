import type { FigureEditorState } from '../state/editorState.svelte';

function selectedBranch(ed: FigureEditorState) {
	const st = ed.selectedStatement;
	return st?.kind === 'branch' && !ed.flags.lockedAll.has(st.i) ? st : null;
}

/** a new branch beside or under the selected one, its text ready to type over */
export function addBranch(ed: FigureEditorState, where: 'child' | 'sibling') {
	const st = selectedBranch(ed);
	const done = st && ed.language.addBranch(ed.source, st, where, 'Node');
	if (done) ed.applyPlaced(done, true);
	return !!done;
}

export function shiftBranch(ed: FigureEditorState, by: -1 | 1) {
	const st = selectedBranch(ed);
	const done = st && ed.language.shiftBranch(ed.source, st, by);
	if (done) ed.applyPlaced(done, false);
}

export function moveBranch(ed: FigureEditorState, i: number, onto: number) {
	const [st, target] = [i, onto].map((k) => ed.picture?.statements.find((s) => s.i === k));
	const done = st && target && ed.language.moveBranch(ed.source, st, target);
	if (done) ed.applyPlaced(done, false);
}
