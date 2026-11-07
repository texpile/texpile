import type { Node } from 'prosemirror-model';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';

export type KeyedEntry = {
	pos: number;
	node: Node;
	command: string;
	starts: boolean;
	cites: boolean;
};

function definesCitationKey(command: string): boolean {
	return !!commonCommand(command)?.args.some((a) => a.role === 'citekey');
}

function keyedEntriesIn(parent: Node, offset: number): KeyedEntry[] {
	const found: KeyedEntry[] = [];
	let owner: Node | null = null;
	let before: Node | null = null;
	parent.forEach((child, at) => {
		const listed = child.type.name === 'list' && child.attrs.kind === 'bullet';
		const continues = listed && before !== null && (child.attrs.envKey === before.attrs.envKey || !child.attrs.envName);
		if (!listed) owner = null;
		else if (!continues) owner = child.attrs.envName ? child : null;
		const command = listed ? ((child.attrs.itemCmd || (owner as Node | null)?.attrs.itemCmd) as string | null) : null;
		if (command) found.push({ pos: offset + at, node: child, command, starts: !continues, cites: definesCitationKey(command) });
		before = listed ? child : null;
	});
	return found;
}

export function keyedEntriesInDoc(doc: Node): KeyedEntry[] {
	const found: KeyedEntry[] = [];
	function visit(parent: Node, offset: number): void {
		found.push(...keyedEntriesIn(parent, offset));
		parent.forEach((child, at) => {
			if (child.type.name !== 'list' && !child.isTextblock && child.childCount > 0) visit(child, offset + at + 1);
		});
	}
	visit(doc, 0);
	return found;
}
