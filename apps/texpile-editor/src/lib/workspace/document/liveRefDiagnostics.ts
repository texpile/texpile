// the live reference checks as source editor diagnostics, beside the last compile's
import type { SourceDiagnostic } from '$lib/editor/source/sourceEditorTypes';
import type { RefProblem } from '$lib/languages/latex/refCheck';
import type { LiveRefProblems } from './liveRefChecks.svelte';
import type { SourceProblem } from '$lib/languages/latex/intellisense/checks/latexChecks';
import { checkIsOn, checkSwitchKey } from '$lib/languages/latex/intellisense/checks/checkSwitches';
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

// the log names a command by its token and an environment in the message
function compileSays(compiled: SourceDiagnostic, problem: SourceProblem): boolean {
	if (problem.anchor.includes('\\')) return compiled.token === problem.anchor;
	return problem.rule === 'undefined-command' && compiled.message.includes(`Environment ${problem.anchor} undefined`);
}

let last: { compiled: SourceDiagnostic[]; live: LiveRefProblems | null; switches: string; out: SourceDiagnostic[] } | null = null;

export function withLiveRefs(compiled: SourceDiagnostic[], live: LiveRefProblems | null, path: string | null): SourceDiagnostic[] {
	if (!live || !path || !samePath(live.path, path) || !(live.problems.length || live.checks.length)) return compiled;
	// the same inputs give the same list, so the editor is not handed a new one to apply
	const switches = checkSwitchKey();
	if (
		last &&
		last.live === live &&
		last.switches === switches &&
		last.compiled.length === compiled.length &&
		last.compiled.every((d, i) => d === compiled[i])
	)
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
			heading: m.lint_reference_check(),
			// a name with no backslash anchors on itself (sourceDiagnosticsFeed.ts)
			anchorText: p.name
		}))
		.filter((l) => !compiled.some((c) => c.line === l.line && c.anchorText === l.anchorText));
	const checked = live.checks
		.filter((p) => checkIsOn(p.rule))
		// the compile already says it on that line
		.filter((p) => !compiled.some((c) => c.line === lineOf(p.at) && compileSays(c, p)))
		.map((p): SourceDiagnostic => {
			const line = lineOf(p.at);
			return {
				line,
				column: p.at - lineStarts[line - 1] + 1,
				severity: 'warning',
				message: p.message,
				anchorText: p.anchor,
				// a command is sized to its own name, anything else anchors on itself
				token: p.anchor.includes('\\') ? p.anchor : undefined,
				rule: p.rule,
				fix: p.fix
			};
		});
	const out = [...compiled, ...added, ...checked];
	last = { compiled, live, switches, out };
	return out;
}
