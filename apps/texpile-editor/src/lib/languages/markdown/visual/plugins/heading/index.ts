import type { SyntaxNode } from '@lezer/common';
import { childrenOf, LineState, trimmedEnd, type MarkdownPlugin, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

function readHeading(r: Reader, node: SyntaxNode): PmNode[] {
	const marks = childrenOf(node).filter((k) => k.name === 'HeaderMark');
	const atx = node.name.startsWith('ATX');
	const from = atx ? marks[0].to : node.from;
	const closing = atx ? (marks.length > 1 ? marks[marks.length - 1] : null) : marks[marks.length - 1];
	const to = trimmedEnd(r, from, closing ? (atx ? closing.from : r.src.lineStart(closing.from)) : node.to);
	const level = Number(node.name.slice(-1)) || 1;
	return [r.node('heading', { level, numbered: true }, r.inline(r, childrenOf(node), from, to, [], new LineState(true)))];
}

export const heading: MarkdownPlugin = {
	import: {
		blocks: {
			ATXHeading1: readHeading,
			ATXHeading2: readHeading,
			ATXHeading3: readHeading,
			ATXHeading4: readHeading,
			ATXHeading5: readHeading,
			ATXHeading6: readHeading,
			SetextHeading1: readHeading,
			SetextHeading2: readHeading
		}
	},
	save: {
		nodes: {
			heading(node, _ctx, core) {
				if (node.childCount === 0) return '';
				const level = Math.min(6, Math.max(1, Number(node.attrs.level ?? 1)));
				const text = core
					.inline(node, { singleLine: true })
					.replace(/\s+$/, '')
					.replace(/(^|\s)(#+)$/, '$1\\$2');
				return `${'#'.repeat(level)} ${text}\n\n`;
			}
		},
		interrupts: (node) => node.type.name === 'heading'
	}
};
