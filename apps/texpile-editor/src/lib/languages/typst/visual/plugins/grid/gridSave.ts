// how a typ_grid is written: the call's named arguments, then each cell set off from the one before as the file set it
// off. A content cell is its body in brackets; a code cell (a figure, a spread) is the code it was
import type { Node } from 'prosemirror-model';
import { codeHolderBody, dedentAfterFirstLine, envLabel, type EnvBodyRender } from '$lib/languages/typst/visual/core/document';

const DEFAULT_GAP = ', ';

function cellSource(cell: Node, render: EnvBodyRender, fileIndent: string): string {
	const only = cell.childCount === 1 ? cell.child(0) : null;
	if (cell.attrs.code && only?.type.name === 'raw_latex') return cell.textContent;
	return codeHolderBody(cell, render, fileIndent, true);
}

/** the grid's source. `nested` is as for an environment: the lines of a grid in a container are written relative to its call's line */
export function gridSource(node: Node, render: EnvBodyRender, nested: boolean): string {
	const fileIndent = nested && typeof node.attrs.typIndent === 'string' ? node.attrs.typIndent : '';
	function relative(text: string): string {
		return dedentAfterFirstLine(text, fileIndent);
	}
	let out = `#grid(${relative(String(node.attrs.args ?? ''))}`;
	node.forEach((cell, _offset, i) => {
		if (i > 0) out += relative(typeof cell.attrs.gap === 'string' ? cell.attrs.gap : DEFAULT_GAP);
		out += cellSource(cell, render, fileIndent);
	});
	return `${out}${relative(String(node.attrs.tail ?? ''))})${envLabel(node, fileIndent)}`;
}
