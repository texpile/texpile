// the last compile's log entries as rows
import type { CompileLogState } from '$lib/stores/compileLogStore';
import { resolveLogPath } from '$lib/stores/compileLogStore';
import type { LogEntry } from '$lib/compileLog/compileLog';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { m } from '$lib/paraglide/messages';
import { changesFix } from '../problemFixes';
import { ignoreKeyOf } from '../ignoredProblems';
import type { Problem, ProblemFilter } from '../problemTypes';

const FILTER_OF: Record<LogEntry['level'], ProblemFilter> = {
	error: 'error',
	warning: 'warning',
	['info']: 'warning',
	badbox: 'box'
};

function packageFix(main: string | null, name: string | undefined): Problem['fix'] {
	if (!main || !name || !/\.tex$/i.test(main)) return undefined;
	const command = `\\usepackage{${name}}`;
	return changesFix(main, m.lint_add_package({ command }), (text) => {
		const at = addPackageInsertion(text, name);
		return at ? [{ from: at.at, insert: at.insert }] : null;
	});
}

export function compileProblems(log: CompileLogState | null, root: string, main: string | null): Problem[] {
	if (!log) return [];
	return [...log.errors, ...log.warnings, ...log.badboxes].map((e): Problem => {
		const filter = FILTER_OF[e.level];
		const file = resolveLogPath(root, e.file);
		return {
			filter,
			file,
			outside: !!e.file && !file,
			line: e.line ?? null,
			message: e.message,
			hint: e.hint,
			source: e.source,
			words: e.command ?? e.anchorText,
			fix: e.level === 'error' ? packageFix(main, e.suggestedPackage) : undefined,
			ignoreKey: ignoreKeyOf(filter, file ?? e.file ?? null, 'compile', e.message, '')
		};
	});
}
