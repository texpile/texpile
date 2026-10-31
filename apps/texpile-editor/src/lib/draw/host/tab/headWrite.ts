/** `now` with `next`'s text before the picture, or null when that part is the same; written first, the splice that
 *  follows starts inside the picture and never takes out its start, where the figure's anchor is */
export function headWrite(now: string, next: string, from: number, nextFrom: number): string | null {
	const head = next.slice(0, nextFrom);
	return head === now.slice(0, from) ? null : head + now.slice(from);
}
