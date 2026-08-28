/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

// the ENGINE's break row for a column split: re-typeset with \vsplit to the column's
// remaining height, so vert_break (club/widow penalties included) picks the cut --
// not JS pixel arithmetic. Refused or empty -> the planners' line arithmetic stands in.
export async function engineSplitTo(
	typeset: (body: { text: string; hsize?: number; splitTo?: number }) => Promise<any>,
	text: string,
	hsize: number,
	room: number
): Promise<{ recsA: PageRecord[]; recsB: PageRecord[] } | undefined> {
	if (!(room > 0)) return undefined;
	const rs = await typeset({ text, hsize, splitTo: room });
	if (rs.ok && rs.splitRecords?.length && rs.records.some((x: any) => x.t === 'line')) {
		return { recsA: rs.records, recsB: rs.splitRecords };
	}
	return undefined;
}
