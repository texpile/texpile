import type { LatexPlugin } from './core';
import { abstract } from './plugins/abstract';
import { algorithm } from './plugins/algorithm';
import { appendix } from './plugins/appendix';
import { bibliography } from './plugins/bibliography';
import { box } from './plugins/box';
import { caption } from './plugins/caption';
import { character } from './plugins/character';
import { citation } from './plugins/citation';
import { color } from './plugins/color';
import { contents } from './plugins/contents';
import { crossReference } from './plugins/crossReference';
import { float } from './plugins/float';
import { footnote } from './plugins/footnote';
import { glossary } from './plugins/glossary';
import { graphic } from './plugins/graphic';
import { heading } from './plugins/heading';
import { include } from './plugins/include';
import { label } from './plugins/label';
import { link } from './plugins/link';
import { list } from './plugins/list';
import { marginNote } from './plugins/marginNote';
import { math } from './plugins/math';
import { pageBreak } from './plugins/pageBreak';
import { picture } from './plugins/picture';
import { quote } from './plugins/quote';
import { rule } from './plugins/rule';
import { slides } from './plugins/slides';
import { spacing } from './plugins/spacing';
import { table } from './plugins/table';
import { textStyle } from './plugins/textStyle';
import { title } from './plugins/title';
import { trackedChange } from './plugins/trackedChange';
import { verbatim } from './plugins/verbatim';

export const latexPlugins: readonly LatexPlugin[] = [
	abstract,
	algorithm,
	appendix,
	bibliography,
	box,
	caption,
	character,
	citation,
	color,
	contents,
	crossReference,
	float,
	footnote,
	glossary,
	graphic,
	heading,
	include,
	// before label: list numbers then label spacing, the order their decorations always had
	list,
	label,
	link,
	marginNote,
	math,
	pageBreak,
	picture,
	quote,
	rule,
	slides,
	spacing,
	table,
	textStyle,
	title,
	trackedChange,
	verbatim
];
