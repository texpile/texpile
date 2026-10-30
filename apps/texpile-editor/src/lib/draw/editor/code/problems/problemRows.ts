import type { FigureEditorState } from '../../state/editorState.svelte';

/** one problem as the panel lists it; `statement` is what a click on it selects */
export type ProblemRow = {
	level: 'error' | 'warning';
	message: string;
	hint: string | null;
	line: number | null;
	statement: number | null;
};

function lineOf(text: string, pos: number) {
	return text.slice(0, pos).split('\n').length;
}

/** the innermost statement written across the line */
function statementOnLine(ed: FigureEditorState, line: number) {
	const on = ed.picture?.statements.filter(
		(s) => s.kind !== 'scope' && lineOf(ed.source, s.from) <= line && line <= lineOf(ed.source, s.to)
	);
	return on?.at(-1)?.i ?? null;
}

/** the line that loads a package or class TeX does not have */
function loadingLine(ed: FigureEditorState, message: string) {
	const name = /^([\w.-]+)\.(?:sty|cls) /.exec(message)?.[1];
	const at = name
		? new RegExp(String.raw`\\(?:usepackage|documentclass|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\b${name}\b`).exec(ed.source)
		: null;
	return at ? lineOf(ed.source, at.index) : null;
}

/** what is wrong with the text as TeX last read it: a picture never closed, statements it left out, its errors */
export function problemRows(ed: FigureEditorState): ProblemRow[] {
	const rows: ProblemRow[] = [];
	const u = ed.unclosed;
	if (u) rows.push({ level: 'error', message: `${u.open} has no ${u.close}`, hint: null, line: u.line, statement: null });
	if (ed.render.failure) rows.push({ level: 'error', message: ed.render.failure, hint: null, line: null, statement: null });
	const first = ed.render.errors[0] ?? null;
	for (const st of ed.picture?.statements.filter((s) => ed.render.failed.includes(s.i)) ?? []) {
		const what = ed.language.describe(ed.source, st).title.toLowerCase();
		rows.push({
			level: 'error',
			message: `${ed.language.engineName} could not draw this ${what}, so it is left out`,
			hint: first,
			line: lineOf(ed.source, st.from),
			statement: st.i
		});
	}
	ed.render.errors.forEach((message, k) => {
		// the error that left statements out is told on their rows
		if (k === 0 && ed.render.failed.length) return;
		const line = ed.render.errorLines[k] ?? loadingLine(ed, message);
		// a missing package is drawn around, not a failure of the picture
		const level = /drawn without it$/.test(message) ? 'warning' : 'error';
		rows.push({ level, message, hint: null, line, statement: line === null ? null : statementOnLine(ed, line) });
	});
	return rows;
}
