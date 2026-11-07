// the units a body is cut into, as the readers that sort a body's parts see them
import type { SyntaxNode } from '@lezer/common';
import type { Piece } from './pieceCursor';
import { environmentName } from './stretch';
import type { TreeImport } from '../importCore/treeImport';
import type { ImportCall } from '../convert/treeCalls';

export const TABLE_ENVS = ['tabular', 'tabular*', 'tabularx', 'longtable'];

export function environmentNameOf(im: TreeImport, env: SyntaxNode): string {
	const begin = env.firstChild;
	return begin ? environmentName(im.src, begin) : '';
}

/** a piece of a stretch with the call it starts, for the table and float readers that sort a body's parts */
export type Unit = { piece: Piece; call: ImportCall | null; from: number; to: number };

/** contributes nothing to a cell: whitespace, a comment, a \par */
export function isBlankUnit(u: Unit): boolean {
	if (u.piece.kind === 'space') return true;
	if (u.call) return u.call.name === 'par';
	return u.piece.kind === 'node' && (u.piece.node.name === 'ParBreak' || u.piece.node.name === 'Comment');
}

export function spanOfUnits(units: Unit[]): { srcFrom: number; srcTo: number; size: number } | null {
	return units.length ? { srcFrom: units[0].from, srcTo: units[units.length - 1].to, size: 1 } : null;
}
