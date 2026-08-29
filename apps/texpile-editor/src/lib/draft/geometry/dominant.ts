/** the key holding the largest count; 0 when the tally is empty */
export function dominant(counts: Map<number, number>): number {
	let best = 0,
		seen = -1;
	for (const [k, c] of counts)
		if (c > seen) {
			seen = c;
			best = k;
		}
	return best;
}
