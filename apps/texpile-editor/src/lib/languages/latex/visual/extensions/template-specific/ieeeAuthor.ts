// parses an IEEEtran \author block (\IEEEauthorblockN/\IEEEauthorblockA, \and separated) into
// structured data for a READ-ONLY preview. never regenerates latex: the raw block stays the
// source of truth, and anything off-shape returns null so the caller falls back to the raw editor.
import type { SyntaxNode } from '@lezer/common';
import { commandTokensOf } from '$lib/languages/latex/syntax/commandTokens';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { groupInner, groupItems, isBlankText, nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';

export type AffilLine = {
	text: string;
	/** The line was wrapped in \textit{…} (IEEE italicises affiliation lines). */
	italic: boolean;
};

export type IeeeAuthor = {
	name: string;
	/** Name carried a leading "N\textsuperscript{st|nd|…}" ordinal (regenerated from card order). */
	ordinal: boolean;
	affil: AffilLine[];
};

function authorGroupOf(text: string): SyntaxNode | null {
	const first = latexTreeOf(text).topNode.firstChild;
	const head = first && isBlankText(text, first) ? nextItem(text, first) : first;
	if (wordOf(text, head) !== 'author') return null;
	const group = nextItem(text, head!);
	return group?.name === 'Group' ? group : null;
}

/** A raw block that looks like an IEEE \author{…\IEEEauthorblockN…} block. */
export function isIeeeAuthorBlock(text: string): boolean {
	return !!authorGroupOf(text) && commandTokensOf(text).list.some((t) => t.name === 'IEEEauthorblockN');
}

const ORDINAL_RE = /^\s*\d+\s*\\textsuperscript\s*\{(?:st|nd|rd|th)\}\s*/;

function groupAfter(text: string, items: SyntaxNode[], name: string): string | null {
	const at = items.findIndex((n) => wordOf(text, n) === name);
	return at < 0 ? null : groupInner(text, items[at + 1] ?? null);
}

/** the items of the author group, split at \and */
function authorChunks(text: string, group: SyntaxNode): SyntaxNode[][] {
	const chunks: SyntaxNode[][] = [[]];
	for (const n of groupItems(text, group)) {
		if (wordOf(text, n) === 'and') chunks.push([]);
		else chunks.at(-1)!.push(n);
	}
	return chunks.filter((c) => c.length > 0);
}

/** Parse an IEEE \author block into author cards, or null if it isn't the expected shape. */
export function parseIeeeAuthors(text: string): IeeeAuthor[] | null {
	const group = authorGroupOf(text);
	if (!group) return null;
	const authors: IeeeAuthor[] = [];
	for (const chunk of authorChunks(text, group)) {
		const name = groupAfter(text, chunk, 'IEEEauthorblockN');
		if (name == null) return null; // not the shape we model, bail to raw
		const affilRaw = groupAfter(text, chunk, 'IEEEauthorblockA');
		const ordinal = ORDINAL_RE.test(name);
		const affil: AffilLine[] = (affilRaw ?? '')
			.split(/\\\\/)
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
			.map((l) => {
				const m = l.match(/^\\textit\s*\{([\s\S]*)\}$/);
				return m ? { text: m[1].trim(), italic: true } : { text: l, italic: false };
			});
		authors.push({ name: name.replace(ORDINAL_RE, '').trim(), ordinal, affil });
	}
	return authors.length > 0 ? authors : null;
}

/** "1st", "2nd", "3rd", "4th", ... for displaying the author ordinal in the preview. */
export function ordinalLabel(n: number): string {
	const v = n % 100;
	const suffix = v >= 11 && v <= 13 ? 'th' : (['st', 'nd', 'rd'][(n % 10) - 1] ?? 'th');
	return `${n}${suffix}`;
}
