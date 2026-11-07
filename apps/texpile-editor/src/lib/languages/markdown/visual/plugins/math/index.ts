import type { SyntaxNode } from '@lezer/common';
import {
	blockStands,
	cellSafe,
	innerText,
	linesOf,
	noteSpans,
	stands,
	type MarkdownPlugin,
	type PmMark,
	type PmNode,
	type Reader
} from '$lib/languages/markdown/visual/core';

function readBlock(r: Reader, node: SyntaxNode): PmNode[] {
	const text = linesOf(r, node).text.trim();
	const inner = text.slice(2, text.endsWith('$$') && text.length > 3 ? -2 : undefined).trim();
	const block = r.node('block_math', { label: null, numbered: false, environment: null, lineLabels: [] }, r.texts(inner));
	return [noteSpans(block, blockStands(r, node))];
}

function readInline(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const delimiter = r.src.text[node.from + 1] === '$' ? 2 : 1;
	const content = innerText(r, node, node.from + delimiter, node.to - delimiter);
	return [r.withMarks(noteSpans(r.node('inline_math', null, r.texts(content)), stands(r, node, 1)), marks)];
}

function inlineMath(text: string, inTableCell: boolean): string {
	const tex = text
		.trim()
		.replace(/\n{2,}/g, '\n')
		.replace(/(^|[^\\])\$/g, '$1\\$');
	if (!tex) return '';
	return inTableCell ? cellSafe(`$${tex}$`) : `$${tex}$`;
}

export const math: MarkdownPlugin = {
	import: { blocks: { MathBlock: readBlock }, inline: { InlineMath: readInline } },
	// `$$` keeps the math and nothing else: no number, label or environment for the equation's menu or settings to set,
	// since none of it would be saved
	schema({ nodes, marks }) {
		return { nodes: nodes.update('block_math', { ...nodes.get('block_math')!, plainDisplay: true }), marks };
	},
	save: {
		nodes: {
			block_math(node) {
				// display math cannot span a blank line, in TeX or in the block rule
				const tex = node.textContent.trim().replace(/\n{2,}/g, '\n');
				return tex ? `$$\n${tex}\n$$\n\n` : '$$\n$$\n\n';
			}
		},
		inline: {
			inline_math(node, core) {
				const math = inlineMath(node.textContent, core.inTableCell);
				return { content: math ? core.shadowed(node, math) : '', marks: core.marks(node.marks), isText: false };
			}
		},
		wholeRun: (node) => node.type.name === 'block_math',
		interrupts: (node) => node.type.name === 'block_math'
	}
};
