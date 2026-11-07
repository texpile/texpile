// @lezer/markdown bars links from nesting, so `[a [b] c](u)` lost its link: a bare pair inside an open link is text here
import { InlineContext, type MarkdownConfig } from '@lezer/markdown';

type Delimiter = { type: unknown; side: number; to: number } | null;

export const bracketSyntax: MarkdownConfig = {
	parseInline: [
		{
			name: 'NestedBracket',
			parse(cx, next, pos) {
				if (next !== 93) return -1;
				const parts = (cx as unknown as { parts: Delimiter[] }).parts;
				let open = parts.length - 1;
				while (
					open >= 0 &&
					!(parts[open] && (parts[open]!.type === InlineContext.linkStart || parts[open]!.type === InlineContext.imageStart))
				)
					open--;
				const start = parts[open];
				if (!start || start.type !== InlineContext.linkStart || !start.side) return -1;
				if (cx.char(pos + 1) === 40 || cx.char(pos + 1) === 91) return -1;
				if (!parts.slice(0, open).some((p) => p && p.type === InlineContext.linkStart && p.side)) return -1;
				parts[open] = null;
				return pos + 1;
			},
			before: 'LinkEnd'
		}
	]
};
