// the table a block is to its writer: alone in the block, or after lines of commands that print nothing
import type { Node } from 'prosemirror-model';

export type HeldTable = {
	/** where the table stands in the block */
	offset: number;
	/** the source of the lines before it, such as \renewcommand{\arraystretch}{1.3} */
	before: string;
};

function commandsOnly(node: Node): boolean {
	if (node.type.name !== 'paragraph' || node.childCount === 0) return false;
	let only = true;
	node.forEach((child) => {
		if (child.type.name !== 'inline_latex' && !(child.isText && !child.text?.trim())) only = false;
	});
	return only;
}

export function heldTable(block: Node): HeldTable | null {
	let offset: number | null = null;
	let fits = true;
	const before: string[] = [];
	block.forEach((child, at) => {
		if (child.type.name === 'table' && offset === null) offset = at;
		else if (offset === null && commandsOnly(child)) before.push(child.textContent.trim());
		else fits = false;
	});
	return fits && offset !== null ? { offset, before: before.join('\n') } : null;
}
