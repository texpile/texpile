export function changedSpan(before: string, after: string): { from: number; to: number } | null {
	if (before === after) return null;
	const max = Math.min(before.length, after.length);
	let from = 0;
	while (from < max && before.charCodeAt(from) === after.charCodeAt(from)) from++;
	let tail = 0;
	while (tail < max - from && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
	return { from, to: after.length - tail };
}
