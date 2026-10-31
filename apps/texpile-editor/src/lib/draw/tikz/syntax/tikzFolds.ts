import { m } from '$lib/paraglide/messages';
import type { CodeFold } from '$lib/draw/editor/figure/figureLanguage';
import { bracketFolds } from '$lib/draw/editor/figure/codeFolds';

/** the preamble after the line naming the class, rarely read once the figure is drawn */
function preambleFolds(source: string): CodeFold[] {
	const named = /^\\documentclass[^\n]*$/m.exec(source);
	const begin = source.indexOf('\\begin{document}');
	if (!named || begin < 0) return [];
	const [from, to] = [named.index + named[0].length, source.lastIndexOf('\n', begin)];
	return to > from ? [{ from, to, label: m.figure_fold_preamble(), collapsed: true }] : [];
}

/** each environment over several lines, all but its `\end` line */
function environmentFolds(source: string): CodeFold[] {
	const open: { name: string; lineEnd: number }[] = [];
	const folds: CodeFold[] = [];
	for (const m of source.matchAll(/\\(begin|end)\{([^}]*)\}/g)) {
		const lineStart = source.lastIndexOf('\n', m.index) + 1;
		if (source.slice(lineStart, m.index).includes('%')) continue;
		if (m[1] === 'begin') {
			const end = source.indexOf('\n', m.index);
			open.push({ name: m[2], lineEnd: end < 0 ? source.length : end });
			continue;
		}
		const at = open.map((o) => o.name).lastIndexOf(m[2]);
		if (at < 0) continue;
		const [o] = open.splice(at);
		const to = lineStart - 1;
		if (to > o.lineEnd) folds.push({ from: o.lineEnd, to, label: null, collapsed: false });
	}
	return folds;
}

/** the `dimension` style the editor writes in a picture's options, inside its braces */
function dimensionStyleFolds(source: string): CodeFold[] {
	return [...source.matchAll(/dimension\/\.style=\{/g)].flatMap((found) => {
		const from = found.index + found[0].length;
		let depth = 1;
		let to = from;
		for (; to < source.length && depth; to++) depth += source[to] === '{' ? 1 : source[to] === '}' ? -1 : 0;
		return depth ? [] : [{ from, to: to - 1, label: m.figure_fold_dimension_style(), collapsed: true }];
	});
}

/** what the code pane can collapse; the gutter folds the first that starts on a line, so an option inside a line is last */
export function tikzFolds(source: string): CodeFold[] {
	return [...preambleFolds(source), ...environmentFolds(source), ...bracketFolds(source, '%'), ...dimensionStyleFolds(source)];
}
