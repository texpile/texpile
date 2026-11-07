// what of the open file its scope is built from, read off its syntax tree
import { statementsOf } from '../../../knowledge';
import { typstTop } from '../../../knowledge/scan/syntax';

export type FileLets = {
	/** each top-level import as Typst reads it, its spec and its items */
	imports: string;
	/** every name the file binds by a let, in order */
	names: string;
	/** the text of the lets of each name */
	byName: Map<string, string>;
};

export function readFileLets(source: string): FileLets {
	const imports: string[] = [];
	const names: string[] = [];
	const byName = new Map<string, string>();
	for (const statement of statementsOf(typstTop(source), source)) {
		if ('imp' in statement) {
			imports.push(JSON.stringify(statement.imp));
			continue;
		}
		const text = source.slice(statement.node.from, statement.node.to);
		for (const name of statement.lets) {
			names.push(name);
			byName.set(name, byName.has(name) ? `${byName.get(name)}\n${text}` : text);
		}
	}
	return { imports: imports.join('\n'), names: names.join('\n'), byName };
}

export function changedLets(before: FileLets, after: FileLets): Set<string> {
	const names = new Set([...before.byName.keys(), ...after.byName.keys()]);
	return new Set([...names].filter((name) => before.byName.get(name) !== after.byName.get(name)));
}
