// TeX reads a command's arguments past a line-end comment (\markboth{Left}%, then {Right} on the next line); the parse
// stops at the comment, so once comments are stripped the arguments it left missing are read again
import { gobbleArguments } from '@unified-latex/unified-latex-util-arguments';
import type * as Ast from '@unified-latex/unified-latex-types';
import type { SameLineCommented } from '../macros';

function missing(arg: Ast.Argument): boolean {
	return arg.openMark === '' && arg.content.length === 0;
}

function completeIn(nodes: Ast.Node[], record: Ast.MacroInfoRecord): void {
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i];
		if ('content' in node && Array.isArray(node.content)) completeIn(node.content, record);
		if (node.type !== 'macro') continue;
		for (const arg of node.args ?? []) completeIn(arg.content, record);
		const entry = record[node.content];
		const signature = entry?.signature;
		if (!signature || entry.argumentParser || !node.args || !(node as SameLineCommented)._sameLineComment) continue;
		let from = node.args.length;
		while (from > 0 && missing(node.args[from - 1])) from--;
		if (from === node.args.length) continue;
		const specs = signature.split(' ');
		if (specs.length !== node.args.length) continue;
		const { args } = gobbleArguments(nodes, specs.slice(from).join(' '), i + 1);
		node.args.splice(from, args.length, ...args);
	}
}

/** `record`: the signatures the parse attached */
export function attachArgsPastComments(ast: Ast.Root, record: Ast.MacroInfoRecord): void {
	completeIn(ast.content, record);
}
