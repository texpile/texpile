import type { SyntaxNode } from '@lezer/common';
import { collapseTextNodes, type ConversionContext, type PmNode } from '../../../builders';
import { applyLigaturesToNodes } from '../inlineRuns';
import { bindTextToChips } from '../chipText';
import { PieceCursor, type Piece } from '../../walk/pieceCursor';
import { bodyOf, environmentName, type Stretch } from '../../walk/stretch';
import type { TreeImport } from '../treeImport';
import { isSamelineComment, type ImportCall } from '../treeCalls';
import { callInline, pieceInline, readCallAt } from '../inlineTree';

export const TABLE_ENVS = ['tabular', 'tabular*', 'tabularx', 'longtable'];

export function environmentNameOf(im: TreeImport, env: SyntaxNode): string {
	const begin = env.firstChild;
	return begin ? environmentName(im.src, begin) : '';
}

/** a table environment in the stretch, inside groups and environments but not inside a command's arguments */
export function containsTabularIn(im: TreeImport, s: Stretch): boolean {
	const cursor = new PieceCursor(im.src, s);
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind !== 'node') continue;
		const name = p.node.name;
		if (name === 'ControlWord' || name === 'ControlSymbol') readCallAt(im, cursor, p);
		else if (name === 'Group' && containsTabularIn(im, bodyOf(p.node))) return true;
		else if (name === 'Environment') {
			if (TABLE_ENVS.includes(environmentNameOf(im, p.node))) return true;
			if (containsTabularIn(im, bodyOf(p.node))) return true;
		}
	}
	return false;
}

/** a piece of a stretch with the call it starts, for the table and float readers that sort a body's parts */
export type Unit = { piece: Piece; call: ImportCall | null; from: number; to: number };

/** the units of a stretch; a comment after something on its line lives in the bytes */
export function unitsIn(im: TreeImport, s: Stretch): Unit[] {
	const cursor = new PieceCursor(im.src, s);
	const out: Unit[] = [];
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'node' && p.node.name === 'Comment' && isSamelineComment(im.src, p.from)) continue;
		const call = p.kind === 'node' && (p.node.name === 'ControlWord' || p.node.name === 'ControlSymbol') ? readCallAt(im, cursor, p) : null;
		out.push({ piece: p, call, from: p.from, to: call?.to ?? p.to });
	}
	return out;
}

/** contributes nothing to a cell: whitespace, a comment, a \par */
export function isBlankUnit(u: Unit): boolean {
	if (u.piece.kind === 'space') return true;
	if (u.call) return u.call.name === 'par';
	return u.piece.kind === 'node' && (u.piece.node.name === 'ParBreak' || u.piece.node.name === 'Comment');
}

export function isBlankStretchOf(im: TreeImport, s: Stretch): boolean {
	return unitsIn(im, s).every(isBlankUnit);
}

export function unitsInline(im: TreeImport, units: Unit[], ctx: ConversionContext): PmNode[] {
	const out: PmNode[] = [];
	for (const u of units) {
		// a line wrap right after a hard break is ignored by TeX
		if (u.piece.kind === 'space' && (u.piece.eaten || out[out.length - 1]?.type.name === 'hard_break')) continue;
		const made = u.call ? callInline(im, u.call, ctx) : pieceInline(im, u.piece, ctx);
		if (made) out.push(...made);
	}
	return applyLigaturesToNodes(bindTextToChips(collapseTextNodes(out)));
}

export function spanOfUnits(units: Unit[]): { srcFrom: number; srcTo: number; size: number } | null {
	return units.length ? { srcFrom: units[0].from, srcTo: units[units.length - 1].to, size: 1 } : null;
}
