import type { Node } from 'prosemirror-model';
import { codeHolderBody, dedentAfterFirstLine, envLabel, type EnvBodyRender } from '$lib/languages/typst/visual/core/document';

const DEFAULT_GAP = ', ';

function cellSource(cell: Node, render: EnvBodyRender, fileIndent: string): string {
	const only = cell.childCount === 1 ? cell.child(0) : null;
	if (cell.attrs.code && only?.type.name === 'raw_latex') return cell.textContent;
	return codeHolderBody(cell, render, fileIndent, true);
}

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
