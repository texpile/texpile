import type { EditorState } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import { commonEnvFacts, isItemCommand } from '$lib/languages/latex/knowledge/environments/envFacts';
import { latexTreeAt } from '../intellisense/completion/mathContext';
import { innermostEnvironmentAt } from '../syntax/innermostEnvironment';
import { literalAt } from '../syntax/treeMode';

export type OpenList = {
	env: string;
	itemAt: number;
};

const BREAKS_ITEM = new Set(['Environment', 'VerbatimEnvironment', 'ParBreak', 'StrayEnd']);

function takesItem(env: string, command: string): boolean {
	return (commonEnvFacts(env).item ?? []).includes(command);
}

/** the list the caret is in the item of; null elsewhere, after an item's blank line or nested environment, and in literal text */
export function openListAt(state: EditorState, pos: number): OpenList | null {
	const tree = latexTreeAt(state, pos);
	const literal = tree && literalAt(tree, pos);
	if (!tree || literal === 'VerbatimBody' || literal === 'Verb') return null;
	const text = docText(state.doc);
	const env = innermostEnvironmentAt(tree, text, pos);
	if (!env || !takesItem(env.name, 'item')) return null;
	let itemAt: number | null = null;
	for (let child = env.node.firstChild; child && child.from < pos; child = child.nextSibling) {
		if (child.name === 'ControlWord') {
			const command = text.slice(child.from + 1, child.to);
			if (!isItemCommand(command)) continue;
			if (!takesItem(env.name, command)) return null;
			itemAt = child.to;
		} else if (BREAKS_ITEM.has(child.name)) itemAt = null;
	}
	return itemAt === null ? null : { env: env.name, itemAt };
}
