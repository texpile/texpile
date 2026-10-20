// the edit that loads one package before another
import { codeOnly } from '../../texCode';
import { groupDepthsAt } from './groupDepth';
import { loaderCalls } from './loaderCommands';

export type TextChange = { from: number; to?: number; insert?: string };

type PlainLine = { start: number; end: number };

// the preamble's lines that hold one package and nothing else, by package name
function plainPackageLines(text: string): Map<string, PlainLine> {
	const code = codeOnly(text);
	const begins = [...code.matchAll(/\\begin\s*\{document\}/g)];
	const calls = loaderCalls(code, ['package']);
	const depths = groupDepthsAt(code, [...begins.map((b) => b.index), ...calls.map((c) => c.at)]);
	const beginAt = begins.find((_, i) => depths[i] === 0)?.index;
	const lines = new Map<string, PlainLine>();
	if (beginAt === undefined) return lines;
	calls.forEach((call, i) => {
		const value = call.args[0].values[0];
		if (call.end > beginAt || depths[begins.length + i] !== 0 || call.args[0].values.length !== 1 || lines.has(value.value)) return;
		const start = text.lastIndexOf('\n', call.at - 1) + 1;
		const newline = text.indexOf('\n', call.end - 1);
		if (newline === -1) return;
		const before = code.slice(start, call.at);
		const after = code.slice(call.end, newline);
		if (before.trim() || after.trim()) return;
		lines.set(value.value, { start, end: newline + 1 });
	});
	return lines;
}

/** the changes that move the line of `first` above the line of `second`; null unless both stand alone on a top-level line of the preamble and `first` comes later */
export function movePackageAbove(text: string, first: string, second: string): TextChange[] | null {
	const lines = plainPackageLines(text);
	const from = lines.get(first);
	const to = lines.get(second);
	if (!from || !to || from.start < to.end) return null;
	return [
		{ from: to.start, insert: text.slice(from.start, from.end) },
		{ from: from.start, to: from.end }
	];
}
