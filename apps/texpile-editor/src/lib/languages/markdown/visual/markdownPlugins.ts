import type { MarkdownPlugin } from './core';
import { code } from './plugins/code';
import { emphasis } from './plugins/emphasis';
import { footnote } from './plugins/footnote';
import { heading } from './plugins/heading';
import { image } from './plugins/image';
import { lineBreak } from './plugins/lineBreak';
import { link } from './plugins/link';
import { list } from './plugins/list';
import { math } from './plugins/math';
import { quote } from './plugins/quote';
import { rule } from './plugins/rule';
import { strike } from './plugins/strike';
import { table } from './plugins/table';

export const markdownPlugins: readonly MarkdownPlugin[] = [
	link,
	emphasis,
	quote,
	rule,
	heading,
	code,
	math,
	lineBreak,
	image,
	list,
	table,
	footnote,
	strike
];
