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

// an environment opened this far above an edit is not looked for
const MAX_BACK = 400;

/** The line a run records the next edit's point at. No point can be recorded inside an environment, so an edit in one
 * starts from the first line of the paragraph that opens the outermost one around it; any other from its own paragraph */
export function stageLine(lines: string[], edit: LineEdit): number {
	const start = paragraphStart(lines, edit);
	let closed = 0;
	let outer = 0;
	for (let i = start - 2; i >= 0 && start - i <= MAX_BACK; i--) {
		const code = lines[i].replace(/(^|[^\\])%.*$/, '$1');
		for (const m of [...code.matchAll(/\\(begin|end)\s*\{([^}]*)\}/g)].reverse()) {
			if (m[2] === 'document') return outer ? paragraphStart(lines, { from: outer, oldTo: outer, newTo: outer }) : start;
			if (m[1] === 'end') closed++;
			else if (closed > 0) closed--;
			else outer = i + 1;
		}
	}
	return outer ? paragraphStart(lines, { from: outer, oldTo: outer, newTo: outer }) : start;
}
