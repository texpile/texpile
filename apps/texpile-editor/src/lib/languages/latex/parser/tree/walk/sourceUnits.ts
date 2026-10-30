import type { Argument } from '../../../knowledge/types';
import { PieceCursor, type Piece } from './pieceCursor';
import type { Stretch } from './stretch';
import { readCall, type TreeCall } from './treeArgs';

/** a piece of a stretch, a command read as its call */
export type SourceUnit = { piece: Piece; call: TreeCall | null };

export function sourceUnitsIn(src: string, s: Stretch, signatureOf: (name: string) => readonly Argument[] | undefined): SourceUnit[] {
	const cursor = new PieceCursor(src, s);
	const out: SourceUnit[] = [];
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind !== 'node' || (p.node.name !== 'ControlWord' && p.node.name !== 'ControlSymbol')) out.push({ piece: p, call: null });
		else {
			const name = src.slice(p.from + 1, p.to);
			out.push({ piece: p, call: readCall(cursor, p, name, signatureOf(name) ?? []) });
		}
	}
	return out;
}
