import type { Tree } from '@lezer/common';
import { commonEnvNames, holdsMath } from '$lib/languages/latex/knowledge/environments/envFacts';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

export type TextRange = [from: number, to: number];

let tables: Set<string> | null = null;
let bibliographies: Set<string> | null = null;

function rangesOf(src: string, tree: Tree, names: Set<string>): TextRange[] {
	const out: TextRange[] = [];
	tree.iterate({
		enter(node) {
			if (node.name !== 'Environment' || !node.node.firstChild || !names.has(environmentName(src, node.node.firstChild))) return;
			out.push([node.from, node.to]);
			return false;
		}
	});
	return out;
}

/** the alignment environments holding text (tabular, longtable), outermost only */
export function tableRanges(src: string): TextRange[] {
	tables ??= new Set(commonEnvNames((f) => !!f.cells && !holdsMath(f)));
	return rangesOf(src, latexTreeOf(src), tables);
}

/** the reference lists, which run to the end of their group when unclosed */
export function bibliographyRanges(src: string): TextRange[] {
	bibliographies ??= new Set(commonEnvNames((f) => !!f.item?.includes('bibitem')));
	return rangesOf(src, latexTreeOf(src), bibliographies);
}

export function blankRanges(src: string, ranges: TextRange[]): string {
	let out = '';
	let at = 0;
	for (const [from, to] of ranges) {
		out += src.slice(at, from) + ' '.repeat(to - from);
		at = to;
	}
	return out + src.slice(at);
}
