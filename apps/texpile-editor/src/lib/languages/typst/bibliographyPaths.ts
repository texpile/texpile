import { typstTreeOf } from './syntax/typstTrees';
import { callsNamed, positionalArgs, stringsOf } from './syntax/typstCalls';

const BIBLIOGRAPHY = new Set(['bibliography']);

/** every file the first `#bibliography(...)` names, as written: one path or an array of them */
export async function typstBibliographyPaths(text: string): Promise<string[]> {
	const tree = await typstTreeOf(text);
	for (const call of callsNamed(tree, text, BIBLIOGRAPHY)) {
		const paths = stringsOf(positionalArgs(call)[0] ?? null, text);
		if (paths.length) return paths;
	}
	return [];
}
