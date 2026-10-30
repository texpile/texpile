// the operations inside a TikZ path that take the options of the path itself
import { keysForMacro, type KeyedArgument } from '../../../knowledge/keyCompletions';
import type { LoadedFile } from '../../packages/loadedPackages';
import { commandTokensOf } from '../../../syntax/commandTokens';
import { blankComments } from '../../../texCode';

// TikZ's own grammar: the words that may be followed by [options] in a path
export const OPERATION_BEFORE = /(?<![\\A-Za-z@])(?:edge\s+from\s+parent|coordinate|child|node|edge|plot|pic|to)\s*\[[^[\]{}]*$/;

const MAX_NAMES = 40;

/** the commands of the statement `before` ends in, nearest first */
function statementCommands(before: string): string[] {
	const { list } = commandTokensOf(before);
	let start = blankComments(before).lastIndexOf(';') + 1;
	for (const { name, end } of list) if (name === 'begin' || name === 'end') start = Math.max(start, end);
	const names = list.filter((command) => command.at >= start).map((command) => command.name);
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
