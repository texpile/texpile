// the environments whose entries are \bibitem, read off the tree
import { latexTreeOf } from '../../syntax/latexTrees';
import { environmentName } from '../../syntax/treeMode';
import { commonEnvNames } from './envFacts';

let names: Set<string> | null = null;

/** `end`: where its \end starts, the end of the text when nothing closes it */
export type BibliographyEnv = { from: number; end: number };

export function bibliographyEnvsIn(text: string): BibliographyEnv[] {
	names ??= new Set(commonEnvNames((f) => f.item?.includes('bibitem') ?? false));
	const out: BibliographyEnv[] = [];
	latexTreeOf(text).iterate({
		enter(n) {
			if (n.name !== 'Environment' || !n.node.firstChild || !names!.has(environmentName(text, n.node.firstChild))) return;
			const last = n.node.lastChild!;
			out.push({ from: n.from, end: last.name === 'EndEnv' ? last.from : text.length });
		}
	});
	return out;
}
