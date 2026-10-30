// where a \usepackage line for a missing package goes
import { codeOnly } from '../../texCode';
import { documentWrapperOf } from '../../syntax/documentWrapper';
import { groupDepthsAt } from './groupDepth';
import { loaderCalls } from './loaderCommands';

export type TextInsertion = { at: number; insert: string };

/** after the last top-level \usepackage line of the preamble when nothing else is on it, else on its own line before the line
 * with \begin{document}; null with no top-level \begin{document} */
export function addPackageInsertion(text: string, name: string): TextInsertion | null {
	const code = codeOnly(text);
	const beginAt = documentWrapperOf(text)?.begin.from;
	if (beginAt === undefined) return null;
	const calls = loaderCalls(code, ['package']);
	const depths = groupDepthsAt(text, [beginAt, ...calls.map((c) => c.at)]);
	if (depths[0] !== 0) return null;
	const top = calls.filter((c, i) => c.end <= beginAt && depths[1 + i] === 0);
	const line = `\\usepackage{${name}}`;
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const last = top.at(-1);
	if (last) {
		const lineStart = text.lastIndexOf('\n', last.at - 1) + 1;
		const newline = text.indexOf('\n', Math.max(last.at, last.end - 1));
		const lineEnd = newline === -1 ? text.length : newline;
		let rest = code.slice(lineStart, lineEnd);
		for (const call of [...top].reverse()) {
			if (call.at >= lineStart && call.end <= lineEnd) rest = rest.slice(0, call.at - lineStart) + rest.slice(call.end - lineStart);
		}
		if (!rest.trim()) return { at: text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd, insert: `${eol}${line}` };
	}
	return { at: text.lastIndexOf('\n', beginAt - 1) + 1, insert: `${line}${eol}` };
}
