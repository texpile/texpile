/** written first so the splice after it never takes out the picture's start, the figure's anchor */
export function headWrite(now: string, next: string, from: number, nextFrom: number): string | null {
	const head = next.slice(0, nextFrom);
	return head === now.slice(0, from) ? null : head + now.slice(from);
}
