// math regions of LaTeX or Markdown source, skipping code
import { blankCode, latexCodeRanges, markdownCodeRanges, type CodeRange } from '$lib/editor/snippets/expand/codeRanges';
import { findMathRegions, type MathRegion } from './mathScanner';

export type SourceMathScan = { math: MathRegion[]; code: CodeRange[] };

export function scanSourceMath(text: string, markdown: boolean): SourceMathScan {
	const code = markdown ? markdownCodeRanges(text) : latexCodeRanges(text);
	return { code, math: findMathRegions(blankCode(text, code), !markdown, markdown ? 'pandoc' : 'tex') };
}
