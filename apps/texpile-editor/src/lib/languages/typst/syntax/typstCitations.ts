import type { Tree } from '@lezer/common';
import { typstTreeOf } from './typstTrees';
import { callsNamed, calleeOf, namedArg, positionalArgs, stringsOf } from './typstCalls';

const CITE = new Set(['cite']);
const BIBLIOGRAPHY = new Set(['bibliography']);

type TypstCitations = { keys: Set<string>; all: boolean };

function readCitations(tree: Tree, src: string, keys: Set<string>, comments: string[]): boolean {
	tree.iterate({
		enter: (n) => {
			if (n.name === 'RefMarker') keys.add(src.slice(n.from + 1, n.to));
			else if (n.name === 'LineComment') comments.push(src.slice(n.from + 2, n.to));
			// one the file never closes runs to its end
			else if (n.name === 'BlockComment') comments.push(src.slice(n.from + 2, src.startsWith('*/', n.to - 2) ? n.to - 2 : n.to));
		}
	});
	for (const call of callsNamed(tree, src, CITE)) {
		const key = positionalArgs(call)[0];
		if (key?.name === 'Label') keys.add(src.slice(key.from + 1, key.to - 1));
		else if (key?.name === 'FuncCall' && calleeOf(key, src) === 'label') keys.add(stringsOf(positionalArgs(key)[0] ?? null, src)[0] ?? '');
	}
	keys.delete('');
	return callsNamed(tree, src, BIBLIOGRAPHY).some((call) => {
		const full = namedArg(call, src, 'full');
		return !!full && src.slice(full.from, full.to) === 'true';
	});
}

/** `@key`, `cite(<key>)` and `cite(label("key"))`, commented out ones too; `all` for bibliography(full: true) */
export async function typstCitationsIn(text: string): Promise<TypstCitations> {
	const keys = new Set<string>();
	const comments: string[] = [];
	let all = readCitations(await typstTreeOf(text), text, keys, comments);
	for (let i = 0; i < comments.length && i < 1000; i++)
		all = readCitations(await typstTreeOf(comments[i]), comments[i], keys, comments) || all;
	return { keys, all };
}
