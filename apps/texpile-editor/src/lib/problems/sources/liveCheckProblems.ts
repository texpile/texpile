// the open LaTeX file's live checks as rows: references, missing files, the LaTeX checks that are on
import type { LiveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
import { refProblemText } from '$lib/workspace/document/liveRefDiagnostics';
import type { SourceProblem } from '$lib/languages/latex/intellisense/checks/latexChecks';
import { checkIsOn } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { movePackageAbove } from '$lib/languages/latex/intellisense/packages/packageMove';
import { addPackageElsewhere } from '$lib/stores/editorStore';
import { basename } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';
import { changesFix, replaceFix } from '../problemFixes';
import { ignoreKeyOf } from '../ignoredProblems';
import { lineAt, lineText, linesOf } from '../textLines';
import type { Problem, ProblemFix } from '../problemTypes';

function checkFix(path: string, p: SourceProblem): ProblemFix | undefined {
	const fix = p.fix;
	if (fix?.kind === 'replace-text') return replaceFix(path, p.at, p.anchor, fix.text, m.problems_fix_change({ text: fix.text }));
	if (fix?.kind === 'move-package') {
		const command = `\\usepackage{${fix.first}}`;
		return changesFix(path, m.lint_move_package({ command, earlier: fix.second.replace(/^class-/, '') }), (text) =>
			movePackageAbove(text, fix.first, fix.second)
		);
	}
	if (fix?.kind === 'add-package') {
		const command = `\\usepackage{${fix.name}}`;
		const elsewhere = addPackageElsewhere.current;
		if (fix.into && elsewhere) {
			const into = fix.into;
			return { label: m.lint_add_package_to_file({ command, file: basename(into) }), apply: () => elsewhere(into, fix.name) };
		}
		return changesFix(path, m.lint_add_package({ command }), (text) => {
			const at = addPackageInsertion(text, fix.name);
			return at ? [{ from: at.at, insert: at.insert }] : null;
		});
	}
	return undefined;
}

export function liveCheckProblems(live: LiveRefProblems | null): Problem[] {
	if (!live) return [];
	const lines = linesOf(live.text);
	const refs = live.problems.map((p): Problem => {
		const line = lineAt(lines, p.at);
		const filter = p.kind === 'file-missing' ? 'error' : 'reference';
		return {
			filter,
			file: live.path,
			line,
			message: refProblemText(p),
			words: p.name,
			ignoreKey: ignoreKeyOf(filter, live.path, p.kind, p.name, lineText(lines, line))
		};
	});
	const checks = live.checks
		.filter((p) => checkIsOn(p.rule))
		.map((p): Problem => {
			const line = lineAt(lines, p.at);
			return {
				filter: 'warning',
				file: live.path,
				line,
				message: p.message,
				words: p.anchor,
				fix: checkFix(live.path, p),
				ignoreKey: ignoreKeyOf('warning', live.path, p.rule, p.anchor, lineText(lines, line))
			};
		});
	return [...refs, ...checks];
}
