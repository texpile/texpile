// the options of a node in a forest tree: [content, key=value, key [child]]
import { keysForMacro, type KeyedArgument } from '../../../knowledge/keyCompletions';
import type { LoadedFile } from '../../packages/loadedPackages';

const COMMENT = /(?<!\\)%[^\n]*/g;

/** where the node options `before` ends in start, or -1 when the text is no node option list of an open forest tree */
export function forestOptionsStart(before: string): number {
	const code = before.replace(COMMENT, (c) => ' '.repeat(c.length));
	const begin = code.lastIndexOf('\\begin{forest}');
	if (begin < 0 || code.indexOf('\\end{forest}', begin) >= 0) return -1;
	let depth = 0;
	let comma = -1;
	for (let i = code.length - 1; i > begin; i--) {
		const c = code[i];
		if (c === '}' || c === ']') depth++;
		else if (c === '{' && depth) depth--;
		else if (c === '[' && depth) depth--;
		else if (c === ',' && !depth) comma = i;
		else if (c === '{' || c === '[') return c === '[' && comma >= 0 ? comma + 1 : -1;
	}
	return -1;
}

/** the keys a forest node takes: those \forestset takes */
export function forestKeys(loaded: LoadedFile[]): Promise<KeyedArgument | null> {
	return keysForMacro('forestset', ['{}'], loaded);
}
