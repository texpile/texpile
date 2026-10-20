import { m } from '$lib/paraglide/messages';
import type { SnippetProblem } from './snippetTypes';

// the file is named around this text, so it names the entry and not the file
function inThisFile(p: SnippetProblem): string {
	return p.name ? `"${p.name}": ${p.reason}` : p.reason;
}

/** what is wrong in one file, said once; empty when nothing is */
export function problemSummary(problems: readonly SnippetProblem[]): string {
	if (!problems.length) return '';
	const whole = problems.find((p) => p.whole);
	if (whole) return `${whole.kept ? m.snippet_bar_kept() : m.snippet_bar_not_loaded()} ${whole.reason}`;
	const failed = problems.filter((p) => !p.warning);
	if (failed.length) {
		const count = failed.length === 1 ? m.snippet_bar_failed_one() : m.snippet_bar_failed_other({ count: failed.length });
		return `${count} ${inThisFile(failed[0])}`;
	}
	const count = problems.length === 1 ? m.snippet_bar_warned_one() : m.snippet_bar_warned_other({ count: problems.length });
	return `${count} ${inThisFile(problems[0])}`;
}
