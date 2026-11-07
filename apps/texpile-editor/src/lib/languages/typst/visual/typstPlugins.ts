// the drawn elements of Typst, in the order a chip's plugins are asked; the core reads its name map off this list
import type { TypstPlugin } from './core';
import { date } from './plugins/date';
import { element } from './plugins/element';
import { emphasis } from './plugins/emphasis';
import { figure } from './plugins/figure';
import { footnote } from './plugins/footnote';
import { glossary } from './plugins/glossary';
import { grid } from './plugins/grid';
import { heading } from './plugins/heading';
import { image } from './plugins/image';
import { line } from './plugins/line';
import { lineBreak } from './plugins/lineBreak';
import { link } from './plugins/link';
import { list } from './plugins/list';
import { lorem } from './plugins/lorem';
import { madeEnvironment } from './plugins/madeEnvironment';
import { math } from './plugins/math';
import { outline } from './plugins/outline';
import { packageBlock } from './plugins/packageBlock';
import { packageText } from './plugins/packageText';
import { pageBreak } from './plugins/pageBreak';
import { picture } from './plugins/picture';
import { printedCode } from './plugins/printedCode';
import { quiet } from './plugins/quiet';
import { quote } from './plugins/quote';
import { raw } from './plugins/raw';
import { ref } from './plugins/ref';
import { setRule } from './plugins/setRule';
import { spacing } from './plugins/spacing';
import { stack } from './plugins/stack';
import { symbol } from './plugins/symbol';
import { table } from './plugins/table';
import { textStyle } from './plugins/textStyle';
import { term } from './plugins/term';

export const typstPlugins: readonly TypstPlugin[] = [
	footnote,
	pageBreak,
	spacing,
	outline,
	setRule,
	lorem,
	symbol,
	quiet,
	element,
	stack,
	table,
	image,
	date,
	printedCode,
	line,
	madeEnvironment,
	picture,
	glossary,
	packageText,
	packageBlock,
	list,
	term,
	figure,
	grid,
	heading,
	quote,
	math,
	ref,
	raw,
	link,
	textStyle,
	emphasis,
	lineBreak
];
