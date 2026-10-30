// math regions of LaTeX and Markdown source, for the source-mode math preview

import { findLatexMathRegions } from './latexMathRegions';
import { findMarkdownMathRegions } from './markdownMathRegions';

export type MathRegionKind = 'inline' | 'display';

export type MathRegion = {
	/** Full range including the delimiters (or `\begin…\end`). */
	from: number;
	to: number;
	/** The content between the delimiters. */
	innerFrom: number;
	innerTo: number;
	kind: MathRegionKind;
	/** set when the region is a math environment (align, equation*, …). */
	env?: string;
	/** no closing delimiter yet (mid-edit), clamped at a blank line or EOF. */
	unclosed?: boolean;
};

export function findMathRegions(text: string, markdown = false): MathRegion[] {
	return markdown ? findMarkdownMathRegions(text) : findLatexMathRegions(text);
}

/** region containing pos. right after the closing delimiter still counts, right before the opener does not. */
export function mathRegionAt(regions: MathRegion[], pos: number): MathRegion | null {
	let lo = 0;
	let hi = regions.length - 1;
	let found: MathRegion | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (regions[mid].from < pos) {
			found = regions[mid];
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found && pos <= found.to ? found : null;
}
