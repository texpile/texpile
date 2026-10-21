// what search matches in the visual editor: the text as drawn, never source the reader cannot see
import type { Node } from 'prosemirror-model';
import type { FindMatcher } from './findQuery';

/** a match in plain text, which Replace may rewrite */
export type TextMatch = { kind: 'text'; from: number; to: number };
/** a match inside a chip or a formula, found on what it shows, highlighted whole and never rewritten */
export type UnitMatch = { kind: 'unit'; from: number; to: number; node: Node };
export type FindMatch = TextMatch | UnitMatch;

/** what a chip shows on the page, else null when nothing readable is drawn (a formula), and its LaTeX is searched */
export type ShownText = (node: Node, pos: number) => string | null;

/** a node search treats as one piece: chips, formulas, and any other atom */
export function isFindUnit(node: Node): boolean {
	return !node.isText && (node.isAtom || node.isLeaf || (node.isInline && node.type.spec.code === true));
}

export function findMatches(doc: Node, matcher: FindMatcher, shownText: ShownText): FindMatch[] {
	const matches: FindMatch[] = [];
	let run: { from: number; text: string } | null = null;
	function endRun(): void {
		if (run) for (const hit of matcher.hitsIn(run.text)) matches.push({ kind: 'text', from: run.from + hit.from, to: run.from + hit.to });
		run = null;
	}
	doc.descendants((node, pos) => {
		if (node.isText) {
			// a word across marks is one run; a gap in positions is a new block or a piece in between
			if (run && run.from + run.text.length === pos) run.text += node.text;
			else {
				endRun();
				run = { from: pos, text: node.text ?? '' };
			}
			return false;
		}
		if (!isFindUnit(node)) return true;
		endRun();
		const text = shownText(node, pos) ?? node.textContent;
		if (matcher.hitsIn(text).length) matches.push({ kind: 'unit', from: pos, to: pos + node.nodeSize, node });
		return false;
	});
	endRun();
	return matches.sort((a, b) => a.from - b.from);
}
