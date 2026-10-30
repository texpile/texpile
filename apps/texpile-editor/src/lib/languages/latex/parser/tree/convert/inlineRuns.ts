// runs of inline nodes: ligatures in prose, adjacent chips merged, and a paragraph of chips alone as its source
import { buildNode, textNode, type PmNode } from '../../builders';
import { TEXT_LIGATURES } from '../../../textLigatures';
import { schema } from '../../../schema/latexPMSchema';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';
import { charsOf, concatSpans, noteSpans, replaceKeepingSpans, spansOf, spansOfChars, type LeafSpan } from '$lib/editor/visual/sourceSpans';

export function latexLigaturesToUnicode(text: string): string {
	let out = text;
	for (const { input, prints } of TEXT_LIGATURES) out = out.replaceAll(input, prints);
	return out;
}

/** Apply ligatures to ordinary prose text nodes (not \texttt/code, where -- and `` are literal). */
export function applyLigaturesToNodes(nodes: PmNode[]): PmNode[] {
	return nodes.map((n) => {
		if (!n.isText || !n.text || n.marks.some((m) => m.type.name === 'code')) return n;
		let text = n.text;
		let chars = charsOf(text.length, spansOf(n));
		for (const { input, prints } of TEXT_LIGATURES) {
			if (!text.includes(input)) continue;
			({ text, chars } = replaceKeepingSpans(text, chars, input, prints));
		}
		return text === n.text ? n : noteSpans(schema.text(text, n.marks), spansOfChars(chars));
	});
}

function chipSpans(chip: PmNode): LeafSpan[] | undefined {
	return chip.firstChild ? spansOf(chip.firstChild) : undefined;
}

// only unmarked inline_latex is merged: marks can't live on raw_latex
export function isInlineLatexNode(n?: PmNode): boolean {
	return !!n && n.type.name === 'inline_latex' && n.marks.length === 0;
}
export function isWhitespaceTextNode(n?: PmNode): boolean {
	return !!n && n.isText && (n.text ?? '').trim() === '';
}

// only code merges: a command the editor draws stays a chip of its own
export function mergeAdjacentInlineLatex(nodes: PmNode[]): PmNode[] {
	const out: PmNode[] = [];
	function mergeable(n?: PmNode) {
		return isInlineLatexNode(n) && !n!.textContent.startsWith('%') && !drawnCommand(n!.textContent);
	}
	let i = 0;
	while (i < nodes.length) {
		if (!mergeable(nodes[i])) {
			out.push(nodes[i]);
			i++;
			continue;
		}
		let raw = nodes[i].textContent;
		const parts = [{ len: raw.length, spans: chipSpans(nodes[i]) }];
		let j = i + 1;
		let merged = false;
		while (j < nodes.length) {
			if (mergeable(nodes[j])) {
				raw += nodes[j].textContent;
				parts.push({ len: nodes[j].textContent.length, spans: chipSpans(nodes[j]) });
				j++;
				merged = true;
			} else if (isWhitespaceTextNode(nodes[j]) && mergeable(nodes[j + 1])) {
				const space = nodes[j].text ?? '';
				raw += space + nodes[j + 1].textContent;
				parts.push(
					{ len: space.length, spans: spansOf(nodes[j]) },
					{ len: nodes[j + 1].textContent.length, spans: chipSpans(nodes[j + 1]) }
				);
				j += 2;
				merged = true;
			} else {
				break;
			}
		}
		out.push(merged ? buildNode('inline_latex', null, [textNode(raw, null, concatSpans(parts))]) : nodes[i]);
		i = j;
	}
	return out;
}

// a paragraph of nothing but raw LaTeX returns its source, to become one raw_latex block
export function paragraphAsRawLatex(para: PmNode): string | null {
	let out = '';
	let hasChip = false;
	let pure = true;
	para.forEach((child) => {
		if (isInlineLatexNode(child)) {
			out += child.textContent;
			// a comment chip owns its line; restore the newline its text no longer carries
			if (child.textContent.startsWith('%') && !child.textContent.endsWith('\n')) out += '\n';
			hasChip = true;
		} else if (child.type.name === 'hard_break') {
			out += '\\\\\n';
		} else if (isWhitespaceTextNode(child)) {
			out += child.text ?? '';
		} else {
			pure = false;
		}
	});
	if (!pure || !hasChip) return null;
	while (out.endsWith('\n')) out = out.slice(0, -1); // raw_latex appends its own trailing newline
	return out;
}
