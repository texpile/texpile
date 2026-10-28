// the operations inside a TikZ path that take the options of the path itself
import { keysForMacro, type KeyedArgument } from '../../../knowledge/keyCompletions';
import type { LoadedFile } from '../../packages/loadedPackages';

// TikZ's own grammar: the words that may be followed by [options] in a path
export const OPERATION_BEFORE = /(?<![\\A-Za-z@])(?:edge\s+from\s+parent|coordinate|child|node|edge|plot|pic|to)\s*\[[^[\]{}]*$/;

const STATEMENT_START = /;|\\(?:begin|end)\{[^{}]*\}/g;
const COMMENT = /(?<!\\)%[^\n]*/g;
const MAX_NAMES = 40;

/** the commands of the statement `before` ends in, nearest first */
function statementCommands(before: string): string[] {
	const code = before.replace(COMMENT, (c) => ' '.repeat(c.length));
	let start = 0;
	for (const m of code.matchAll(STATEMENT_START)) start = m.index + m[0].length;
	const names = [...code.slice(start).matchAll(/\\([A-Za-z@]+)/g)].map((m) => m[1]);
	return [...new Set(names.reverse())].slice(0, MAX_NAMES);
}

/** the options of the path `before` (the text up to the operation) sits in: those of the nearest command of its statement with some */
export async function pathKeys(before: string, loaded: LoadedFile[]): Promise<KeyedArgument | null> {
	for (const name of statementCommands(before)) {
		const keyed = await keysForMacro(name, ['[]'], loaded);
		if (keyed) return keyed;
	}
	return null;
}
