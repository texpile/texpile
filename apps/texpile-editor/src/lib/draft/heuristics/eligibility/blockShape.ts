// a block read off the tree: `structure` is all but running text, `skeleton` the same with strings blanked
import type { SyntaxNode } from '@lezer/common';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import type { Piece } from '$lib/languages/latex/parser/tree/walk/pieceCursor';
import type { TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { sourceUnitsIn, type SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf, type Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';

export type BlockShape = { structure: string[]; skeleton: string[] };

// a stray bracket outside an argument is text, as it reads
const TEXT_NODES = new Set(['OpenBracket', 'CloseBracket']);
// read whole: their content is not text the editor types
const ATOMS = new Set(['Verb', 'VerbatimEnvironment', 'UrlArgument', 'Skipped']);

function isText(p: Piece): boolean {
	return p.kind !== 'node' || TEXT_NODES.has(p.node.name);
}

function unitsIn(src: string, s: Stretch): SourceUnit[] {
	return sourceUnitsIn(src, s, (name) => BASE_PACKAGE_TABLE.macros[name]);
}

function blankStretch(src: string, s: Stretch): string {
	return unitsIn(src, s)
		.filter((u) => u.call || !isText(u.piece))
		.map((u) => blankUnit(src, u))
		.join('');
}

function blankNode(src: string, node: SyntaxNode): string {
	if (node.name === 'Comment') return '%';
	if (ATOMS.has(node.name) || !node.firstChild) return src.slice(node.from, node.to);
	const body = bodyOf(node);
	return src.slice(node.from, body.from) + blankStretch(src, body) + src.slice(body.to, node.to);
}

/** a bare argument (a star, an unbraced token) is structure; editable text lives inside delimiters */
function blankCall(src: string, call: TreeCall): string {
	let out = src.slice(call.from, call.node.to);
	for (const a of call.args) {
		if (!a.present) continue;
		out += a.open && a.body ? a.open + blankStretch(src, a.body) + a.close : src.slice(a.from, a.to);
	}
	return out;
}

function blankUnit(src: string, u: SourceUnit): string {
	if (u.call) return blankCall(src, u.call);
	return u.piece.kind === 'node' ? blankNode(src, u.piece.node) : '';
}

function printUnit(src: string, u: SourceUnit): string {
	if (u.piece.kind === 'node' && u.piece.node.name === 'Comment') return '%';
	return u.call ? src.slice(u.call.from, u.call.to) : src.slice(u.piece.from, u.piece.to);
}

/** null for a block with nothing to read: an unreadable block must never compare equal to another */
export function blockShapeOf(src: string): BlockShape | null {
	if (!src.trim()) return null;
	const units = unitsIn(src, bodyOf(latexTreeOf(src).topNode)).filter((u) => u.call || !isText(u.piece));
	// `\par` is ours: the merged insert path sends prev + \par + run as one unit
	const structure = units.filter((u) => u.call?.name !== 'par').map((u) => printUnit(src, u));
	return { structure, skeleton: units.map((u) => blankUnit(src, u)) };
}
