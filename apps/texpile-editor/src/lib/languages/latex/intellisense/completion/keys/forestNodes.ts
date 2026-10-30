// the options of a node in a forest tree: [content, key=value, key [child]]
import type { EditorState } from '@codemirror/state';
import { docText } from '$lib/editor/source/docText';
import { keysForMacro, type KeyedArgument } from '../../../knowledge/keyCompletions';
import type { LoadedFile } from '../../packages/loadedPackages';
import { innermostEnvironmentAt } from '../../../syntax/innermostEnvironment';
import { blankComments } from '../../../texCode';
import { latexTreeAt } from '../mathContext';

/** where the node options before `pos` start, or -1 when `pos` is no node option list of a forest tree */
export function forestOptionsStart(state: EditorState, pos: number): number {
	const tree = latexTreeAt(state, pos);
	const forest = tree && innermostEnvironmentAt(tree, docText(state.doc), pos);
	if (forest?.name !== 'forest') return -1;
	const begin = forest.node.firstChild!.to;
	const code = blankComments(state.sliceDoc(begin, pos));
	let depth = 0;
	let comma = -1;
	for (let i = code.length - 1; i >= 0; i--) {
		const c = code[i];
		if (c === '}' || c === ']') depth++;
		else if (c === '{' && depth) depth--;
		else if (c === '[' && depth) depth--;
		else if (c === ',' && !depth) comma = i;
		else if (c === '{' || c === '[') return c === '[' && comma >= 0 ? begin + comma + 1 : -1;
	}
	return -1;
}

/** the keys a forest node takes: those \forestset takes */
export function forestKeys(loaded: LoadedFile[]): Promise<KeyedArgument | null> {
	return keysForMacro('forestset', ['{}'], loaded);
}
