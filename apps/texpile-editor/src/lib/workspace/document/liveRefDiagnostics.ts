// the live reference checks as source editor diagnostics, beside the last compile's
import type { SourceDiagnostic } from '$lib/editor/source/sourceEditorTypes';
import type { RefProblem } from '$lib/languages/latex/refCheck';
import type { LiveRefProblems } from './liveRefChecks.svelte';
import { basename, relativeInside, samePath } from '../fileSystem';
import { workspaceRoot } from '../workspaceStore';
import { m } from '$lib/paraglide/messages';

export function refProblemText(p: RefProblem): string {
	switch (p.kind) {
		case 'label-twice': {
			if (!p.elsewhere) return m.refcheck_label_twice_here({ name: p.name });
			const root = workspaceRoot.current;
			return m.refcheck_label_twice_elsewhere({ name: p.name, file: (root && relativeInside(root, p.elsewhere)) || basename(p.elsewhere) });
		}
		case 'cite-unknown':
			return m.refcheck_cite_unknown({ key: p.name });
		case 'file-missing':
			if (p.what === 'graphic') return m.refcheck_graphic_missing({ name: p.name });
			if (p.what === 'bibliography') return m.refcheck_bibliography_missing({ name: p.name });
			return m.refcheck_input_missing({ name: p.name });
	}
}

let last: { compiled: SourceDiagnostic[]; live: LiveRefProblems | null; out: SourceDiagnostic[] } | null = null;

export function withLiveRefs(compiled: SourceDiagnostic[], live: LiveRefProblems | null, path: string | null): SourceDiagnostic[] {
	if (!live || !path || !samePath(live.path, path) || !live.problems.length) return compiled;
	// the same inputs give the same list, so the editor is not handed a new one to apply
	if (last && last.live === live && last.compiled.length === compiled.length && last.compiled.every((d, i) => d === compiled[i]))
		return last.out;
	const lineStarts = [0];
	for (let i = live.text.indexOf('\n'); i !== -1; i = live.text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
	function lineOf(at: number): number {
		let line = 0;
		while (line + 1 < lineStarts.length && lineStarts[line + 1] <= at) line++;
		return line + 1;
	}
	const added = live.problems
		.map((p): SourceDiagnostic => ({
			line: lineOf(p.at),
			severity: p.kind === 'file-missing' ? 'error' : 'warning',
			message: refProblemText(p),
			// a name with no backslash anchors on itself (sourceDiagnosticsFeed.ts)
			anchorText: p.name
		}))
		.filter((l) => !compiled.some((c) => c.line === l.line && c.anchorText === l.anchorText));
	const out = [...compiled, ...added];
	last = { compiled, live, out };
	return out;
}
