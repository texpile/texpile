// a body cut into units, read through the walk
import { collapseTextNodes, type ConversionContext, type PmNode } from '../../builders';
import { applyLigaturesToNodes } from './inlineRuns';
import { bindTextToChips } from './chipText';
import { PieceCursor } from '../walk/pieceCursor';
import { bodyOf, type Stretch } from '../walk/stretch';
import type { TreeImport } from '../importCore/treeImport';
import { isSamelineComment } from './treeCalls';
import { callInline, pieceInline, readCallAt } from './inlineTree';
import { environmentNameOf, isBlankUnit, TABLE_ENVS, type Unit } from '../walk/units';

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
