// lines of a file's text, for the rows a check finds by offset

export type TextLines = { starts: number[]; text: string };

export function linesOf(text: string): TextLines {
	const starts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
	return { starts, text };
}

/** 1-based */
export function lineAt(lines: TextLines, offset: number): number {
	let lo = 0;
	let hi = lines.starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lines.starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

export function lineText(lines: TextLines, line: number): string {
	const from = lines.starts[line - 1] ?? lines.text.length;
	const next = lines.starts[line];
	return lines.text.slice(from, next === undefined ? lines.text.length : next - 1);
}
