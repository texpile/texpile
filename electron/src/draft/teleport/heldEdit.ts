// An edit mid-typing can leave its paragraph open (`\textbf{wor`, a lone `$`): TeX would then read on through the
// rest of the document as one argument. Such an edit waits for the next keystroke.
import type { LineEdit } from './lineEdit';

// braces and dollars over lines a..b (0-based), as a count TeX's reader would not trust
function balanceOf(lines: string[], a: number, b: number): [number, number] {
	let depth = 0;
	let dollars = 0;
	for (let i = Math.max(0, a); i <= b && i < lines.length; i++) {
		const line = lines[i];
		for (let k = 0; k < line.length; k++) {
			const c = line[k];
			if (c === '\\') k++;
			else if (c === '%') break;
			else if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '$') dollars++;
		}
	}
	return [depth, dollars % 2];
}

/** the edit's own lines changed the balance of braces or inline math, and the paragraphs around them are left open. A
 * source the count misreads (`\verb|$|`, a `%` in a URL) reads the same before and after, so only the edit can hold it */
export function paragraphOpen(before: string[], after: string[], edit: LineEdit): boolean {
	const [was, wasMath] = balanceOf(before, edit.from - 1, edit.oldTo - 1);
	const [is, isMath] = balanceOf(after, edit.from - 1, edit.newTo - 1);
	if (was === is && wasMath === isMath) return false;
	let a = edit.from - 1;
	let b = Math.max(edit.newTo, edit.from) - 1;
	while (a > 0 && after[a - 1].trim() !== '') a--;
	while (b < after.length - 1 && after[b + 1].trim() !== '') b++;
	const [depth, math] = balanceOf(after, a, b);
	return depth !== 0 || math !== 0;
}

/** the first line of the paragraph holding the edit: typing goes on there, so the next teleport starts from it */
export function paragraphStart(lines: string[], edit: LineEdit): number {
	let from = edit.from - 1;
	while (from > 0 && lines[from - 1].trim() !== '') from--;
	return from + 1;
}
