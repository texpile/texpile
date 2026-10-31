/** pasted text's lines with their shared indent taken off; copied from where its first statement starts, the first line
 *  has lost the indent the others keep */
export function pastedLines(lines: string[]): string[] {
	const indents = lines.map((l) => /^[ \t]*/.exec(l)![0].length);
	const common = Math.min(...(indents[0] === 0 && lines.length > 1 ? indents.slice(1) : indents));
	return lines.map((l, k) => l.slice(Math.min(common, indents[k])));
}
