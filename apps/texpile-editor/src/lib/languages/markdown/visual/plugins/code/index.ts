import type { SyntaxNode } from '@lezer/common';
import {
	bytesSpan,
	charsOfRanges,
	childNamed,
	childrenOf,
	codeSpan,
	dedent,
	innerText,
	sliceOf,
	spansOfChars,
	stands,
	unescapeAll,
	withoutFinalBreak,
	type MarkdownPlugin,
	type PmMark,
	type PmNode,
	type Reader
} from '$lib/languages/markdown/visual/core';

function fenceIndent(r: Reader, node: SyntaxNode, texts: SyntaxNode[]): number {
	const open = childNamed(node, 'CodeMark');
	if (!open || texts.length === 0) return 0;
	const lineStart = r.src.lineStart(open.from);
	if (/[^ \t>]/.test(r.src.text.slice(lineStart, open.from))) return 0;
	return Math.max(0, open.from - lineStart - (texts[0].from - r.src.lineStart(texts[0].from)));
}

const THREE_LINE_BREAKS = /\n[^]*\n[^]*\n/;

function readFence(r: Reader, node: SyntaxNode): PmNode[] {
	const infoNode = childNamed(node, 'CodeInfo');
	const infoString = infoNode ? unescapeAll(sliceOf(r, infoNode)).trim() : '';
	const texts = childrenOf(node).filter((k) => k.name === 'CodeText');
	let chars = dedent(charsOfRanges(r, texts), fenceIndent(r, node, texts));
	const marks = childrenOf(node).filter((k) => k.name === 'CodeMark');
	const closing = marks.length > 1 ? marks[marks.length - 1] : null;
	if (!closing && node.to === r.src.text.length) chars = withoutFinalBreak(chars);
	// the tree has the same text for one blank line as for two
	else if (
		closing &&
		chars.text === '\n' &&
		!THREE_LINE_BREAKS.test(r.src.text.slice(r.src.lineEnd(node.from), r.src.lineStart(closing.from)))
	)
		chars = { text: '', offsets: [] };
	const tilde = marks[0] && r.src.text[marks[0].from] === '~';
	return [
		r.node(
			'code_block',
			{ lang: infoString, env: 'fence', args: infoString, fence: tilde ? '~' : '`' },
			r.texts(chars.text, null, spansOfChars(r, chars))
		)
	];
}

function readCodeSpan(r: Reader, node: SyntaxNode, marks: PmMark[]): PmNode[] {
	const kids = childrenOf(node);
	const open = kids[0];
	const close = kids[kids.length - 1];
	const raw = r.src.text.slice(open.to, close.from);
	const content = innerText(r, node, open.to, close.from).replace(/\n/g, ' ');
	const padded = content.startsWith(' ') && content.endsWith(' ') && /[^ ]/.test(content);
	const text = padded ? content.slice(1, -1) : content;
	const spans = content !== raw ? stands(r, node, text.length) : bytesSpan(text.length, r.src.at(open.to + (padded ? 1 : 0)));
	return r.texts(text, [...marks, { type: 'code' }], spans);
}

function readIndented(r: Reader, node: SyntaxNode): PmNode[] {
	const chars = charsOfRanges(
		r,
		childrenOf(node).filter((k) => k.name === 'CodeText')
	);
	return [r.node('code_block', { lang: '', env: 'indented', args: '' }, r.texts(chars.text, null, spansOfChars(r, chars)))];
}

export const code: MarkdownPlugin = {
	import: {
		blocks: { FencedCode: readFence, CodeBlock: readIndented },
		inline: { InlineCode: readCodeSpan }
	},
	// a code block made without attrs is a fence, so the language picker works on every block
	schema({ nodes, marks }) {
		const base = nodes.get('code_block')!;
		return {
			nodes: nodes.update('code_block', {
				...base,
				attrs: { ...base.attrs, lang: { default: '' }, env: { default: 'fence' }, args: { default: '' }, fence: { default: '`' } }
			}),
			marks
		};
	},
	save: {
		nodes: {
			code_block(node) {
				const infoString = String(node.attrs.args ?? '')
					.trim()
					.replace(/\n/g, ' ');
				const content = node.textContent;
				// a backtick in the info string is only legal on a tilde fence
				const ch = infoString.includes('`') || node.attrs.fence === '~' ? '~' : '`';
				const runs = content.match(ch === '~' ? /~{3,}/g : /`{3,}/g);
				const fence = ch.repeat(runs ? Math.max(3, ...runs.map((run) => run.length)) + 1 : 3);
				return `${fence}${infoString}\n${content}\n${fence}\n\n`;
			}
		},
		text(node, core) {
			if (!node.marks.some((m) => m.type.name === 'code')) return null;
			return { content: codeSpan(core.shadowed(node, node.text ?? ''), core.inTableCell), marks: core.marks(node.marks), isText: false };
		},
		wholeRun: (node) => node.type.name === 'code_block',
		interrupts: (node) => node.type.name === 'code_block'
	}
};
