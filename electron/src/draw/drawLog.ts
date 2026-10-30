// TeX's errors while drawing one picture, read off its stretch of the log
// texmf.cnf's max_print_line: TeX breaks a longer log line there
const LOG_LINE = 79;

function errorLine(lines: string[], k: number): number | null {
	for (let next = k + 1; next < lines.length && !lines[next].startsWith('! '); next++) {
		const m = /^l\.(\d+)[ ]/.exec(lines[next]);
		if (m) return Number(m[1]);
	}
	return null;
}

function inPicture(lines: string[], k: number): boolean {
	for (let at = k - 1; at >= 0; at--) if (lines[at].includes('work/picture.tex')) return !lines[at].includes('work/picture.tex)');
	return false;
}

/** each error, `! ` stripped and joined where TeX broke it, with the line of the picture it was reading */
export function logErrors(log: string): { message: string; line: number | null }[] {
	const lines = log.split('\n');
	return lines.flatMap((l, k) => {
		if (!l.startsWith('! ') || l === '! Emergency stop.') return [];
		let message = l.slice(2);
		for (let next = k; lines[next].length === LOG_LINE && next + 1 < lines.length; next++) message += lines[next + 1];
		return [{ message, line: inPicture(lines, k) ? errorLine(lines, k) : null }];
	});
}
