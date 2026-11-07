// a table environment inside a chip (a cell of two lines, \tcell's stack, a table in a group of its own settings): its
// rows and cells as a small table, each cell drawn as the chip's text is
import type { SyntaxNode } from '@lezer/common';
import {
	argText,
	documentTable,
	environmentName,
	faceElement,
	mandatoryArgs,
	readEnvironment,
	type ChipFace,
	type SourceUnit,
	type UnitsDrawer
} from '$lib/languages/latex/visual/core';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import './inlineTabular.css';

// the spanning commands the table reader opens (tableTree's unwrapSpans): the span is the first argument, the text the third.
// A \multirow's text sits in its first row, as the cells under it are written empty
const SPANS = new Set(['multicolumn', 'multirow']);

function factsOf(name: string) {
	const { bodies } = documentTable.current;
	return Object.hasOwn(bodies, name) ? bodies[name] : commonEnvFacts(name);
}

/** an environment of rows and cells set in text */
export function isTextTable(name: string): boolean {
	const facts = factsOf(name);
	return !!facts.cells && facts.body === undefined;
}

function isTab(src: string, u: SourceUnit): boolean {
	return u.piece.kind === 'word' && src[u.piece.from] === '&';
}

function isBlank(u: SourceUnit): boolean {
	return u.piece.kind === 'space' || (u.piece.kind === 'node' && (u.piece.node.name === 'Comment' || u.piece.node.name === 'ParBreak'));
}

/** the rows of `units`, each a list of cells; null when a word runs on from an & */
function rowsOf(src: string, units: SourceUnit[]): SourceUnit[][][] | null {
	const rows: SourceUnit[][][] = [];
	let row: SourceUnit[][] = [];
	let cell: SourceUnit[] = [];
	for (const u of units) {
		// a cell shows what it prints, and a comment line in a table holds a row taken out
		if (u.piece.kind === 'node' && u.piece.node.name === 'Comment') continue;
		if (isTab(src, u)) {
			if (u.piece.to - u.piece.from > 1) return null;
			row.push(cell);
			cell = [];
		} else if (u.call && commonFacts(u.call.name).endsRow) {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = [];
		} else if (!(u.call && commonFacts(u.call.name).betweenRows)) cell.push(u);
	}
	if (!cell.every(isBlank) || row.length) rows.push([...row, cell]);
	return rows;
}

/** the columns the cell spans and the units it shows */
function cellOf(src: string, units: SourceUnit[], drawer: UnitsDrawer): { columns: number; shown: SourceUnit[] } {
	let columns = 1;
	let shown = units;
	for (;;) {
		const meaningful = shown.filter((u) => !isBlank(u));
		const call = meaningful.length === 1 ? meaningful[0].call : null;
		const args = call && SPANS.has(call.name) ? mandatoryArgs(call) : [];
		if (args.length < 3 || !args[args.length - 1].body) return { columns, shown };
		if (call!.name === 'multicolumn') columns = Math.max(1, Number.parseInt(argText(src, args[0]), 10) || 1);
		shown = drawer.unitsOf(args[args.length - 1].body!);
	}
}

export function inlineTabularPart(node: SyntaxNode, src: string, drawer: UnitsDrawer): ChipFace | null {
	if (node.name !== 'Environment' || !node.firstChild) return null;
	const name = environmentName(src, node.firstChild);
	if (!isTextTable(name)) return null;
	const { envs } = documentTable.current;
	const env = readEnvironment(src, node, Object.hasOwn(envs, name) ? envs[name] : []);
	const rows = rowsOf(src, drawer.unitsOf(env.body));
	if (!rows) return null;
	const dom = faceElement('span', 'drawn-tabular');
	let width = 1;
	const parts: ChipFace[] = [];
	function fail(): null {
		parts.forEach((part) => part.destroy?.());
		return null;
	}
	for (const [r, row] of rows.entries()) {
		let column = 1;
		for (const cell of row) {
			const { columns, shown } = cellOf(src, cell, drawer);
			const drawn = drawer.draw(shown);
			if (!drawn || drawn.some((part) => part.line)) {
				drawn?.forEach((part) => part.destroy?.());
				return fail();
			}
			const box = faceElement('span', 'drawn-tabular-cell');
			box.style.gridArea = `${r + 1} / ${column} / auto / span ${columns}`;
			for (const part of drawn) box.appendChild(part.dom);
			parts.push(...drawn);
			dom.appendChild(box);
			column += columns;
		}
		width = Math.max(width, column - 1);
	}
	dom.style.gridTemplateColumns = `repeat(${width}, auto)`;
	return {
		dom,
		decorate: (decorations) => parts.forEach((part) => part.decorate?.(decorations)),
		destroy: () => parts.forEach((part) => part.destroy?.())
	};
}
