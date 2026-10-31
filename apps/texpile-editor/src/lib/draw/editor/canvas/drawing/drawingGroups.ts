import type { DrawnPart } from '../../drawing/drawing.types';

/** the drawing's parts by statement, in drawing order, the hidden ones left out */
export function partsByStatement(parts: DrawnPart[], hidden: ReadonlySet<number>): [number, DrawnPart[]][] {
	const byStatement = new Map<number, DrawnPart[]>();
	for (const p of parts) {
		if (hidden.has(p.stmt)) continue;
		const own = byStatement.get(p.stmt);
		if (own) own.push(p);
		else byStatement.set(p.stmt, [p]);
	}
	return [...byStatement];
}
