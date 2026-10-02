// what goes with a message to the agent: the lines a selection covers, and the content blocks it is sent as
import type { Attached, SelectedLines } from '../agentPanel.types';

// each segment escaped, so a # or ? in a name is not read as a fragment or a query; a drive letter stays as written
function fileUri(path: string): string {
	const p = path
		.replace(/\\/g, '/')
		.split('/')
		.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s)))
		.join('/');
	return `file://${p.startsWith('/') ? '' : '/'}${p}`;
}

function nameOf(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

function lineAt(source: string, at: number): number {
	let n = 1;
	for (let i = source.indexOf('\n'); i !== -1 && i < at; i = source.indexOf('\n', i + 1)) n++;
	return n;
}

/** the lines a span of the file's text covers; one that ends at the start of a line leaves that line out */
export function selectedLines(source: string, from: number, to: number): SelectedLines {
	const end = to > from && source[to - 1] === '\n' ? to - 1 : to;
	return { first: lineAt(source, from), last: lineAt(source, end), text: source.slice(from, to) };
}

/** after the file's name on its pill */
export function linesLabel(lines: SelectedLines): string {
	return lines.first === lines.last ? `:${lines.first}` : `:${lines.first}-${lines.last}`;
}

/** the same file and the same lines are the same attachment, so one taken off stays off until either changes */
export function attachedKey(a: Attached): string {
	return a.lines ? `${a.path}#${a.lines.first}:${a.lines.last}` : a.path;
}

/** a file goes as a link the agent reads itself; a selection as its text, with its lines after the # of its link */
export function attachedBlocks(a: Attached | null): unknown[] {
	if (!a) return [];
	const uri = fileUri(a.path);
	if (!a.lines) return [{ type: 'resource_link', uri, name: nameOf(a.path) }];
	return [{ type: 'resource', resource: { uri: `${uri}#L${a.lines.first}:${a.lines.last}`, text: a.lines.text } }];
}
