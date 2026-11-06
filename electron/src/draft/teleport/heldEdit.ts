// An edit mid-typing can leave its paragraph open (`\textbf{wor`, a lone `$`): TeX would then read on through the
// rest of the document as one argument. Such an edit waits for the next keystroke.
import type { LineEdit } from './lineEdit';

/** the paragraph around the edited lines has unbalanced braces or inline math */
export function paragraphOpen(lines: string[], edit: LineEdit): boolean {
	let from = edit.from - 1;
	let to = Math.max(edit.newTo, edit.from) - 1;
	while (from > 0 && lines[from - 1].trim() !== '') from--;
	while (to < lines.length - 1 && lines[to + 1].trim() !== '') to++;
	let depth = 0;
	let dollars = 0;
	for (let i = from; i <= to && i < lines.length; i++) {
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
	return depth !== 0 || dollars % 2 !== 0;
}

/** the first line of the paragraph holding the edit: typing goes on there, so the next teleport starts from it */
export function paragraphStart(lines: string[], edit: LineEdit): number {
	let from = edit.from - 1;
	while (from > 0 && lines[from - 1].trim() !== '') from--;
	return from + 1;
}
