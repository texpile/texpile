/** the edits (insert, delete, replace, swap of neighbours) that turn a into b */
export function editDistance(a: string, b: string): number {
	const rows: number[][] = [];
	for (let i = 0; i <= a.length; i++) {
		rows[i] = [i];
		for (let j = 1; j <= b.length; j++) {
			if (i === 0) rows[i][j] = j;
			else {
				rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
				if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
			}
		}
	}
	return rows[a.length][b.length];
}

/** the name a looks like a misspelling of, the nearest one */
export function closestName(a: string, names: Iterable<string>): string | undefined {
	const most = a.length <= 4 ? 1 : 2;
	let best: string | undefined;
	let bestDistance = most + 1;
	for (const n of names) {
		if (n === a || Math.abs(n.length - a.length) > most) continue;
		const distance = editDistance(a, n);
		if (distance < bestDistance) {
			best = n;
			bestDistance = distance;
		}
	}
	return best;
}
