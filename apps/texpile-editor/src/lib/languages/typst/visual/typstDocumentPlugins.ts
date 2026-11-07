// what Typst's plugins say of the document, in schema order: ProseMirror takes its defaults from the order of the nodes.
// A call several plugins read is asked of them in this order too
import type { TypstDocumentPlugin } from './core/plugin/typstDocumentPlugin';
import { emphasisDocument } from './plugins/emphasis/document';
import { figureDocument } from './plugins/figure/document';
import { gridDocument } from './plugins/grid/document';
import { headingDocument } from './plugins/heading/document';
import { imageDocument } from './plugins/image/document';
import { lineDocument } from './plugins/line/document';
import { lineBreakDocument } from './plugins/lineBreak/document';
import { linkDocument } from './plugins/link/document';
import { listDocument } from './plugins/list/document';
import { mathDocument } from './plugins/math/document';
import { quoteDocument } from './plugins/quote/document';
import { rawDocument } from './plugins/raw/document';
import { refDocument } from './plugins/ref/document';
import { tableDocument } from './plugins/table/document';
import { termDocument } from './plugins/term/document';
import { textStyleDocument } from './plugins/textStyle/document';
import { footnoteDocument } from './plugins/footnote/document';
import { pageBreakDocument } from './plugins/pageBreak/document';
import { spacingDocument } from './plugins/spacing/document';
import { outlineDocument } from './plugins/outline/document';
import { setRuleDocument } from './plugins/setRule/document';
import { loremDocument } from './plugins/lorem/document';
import { symbolDocument } from './plugins/symbol/document';
import { pictureDocument } from './plugins/picture/document';
import { elementDocument } from './plugins/element/document';
import { stackDocument } from './plugins/stack/document';
import { quietDocument } from './plugins/quiet/document';
import { dateDocument } from './plugins/date/document';
import { printedCodeDocument } from './plugins/printedCode/document';

export const typstDocumentPlugins: readonly TypstDocumentPlugin[] = [
	headingDocument,
	listDocument,
	mathDocument,
	quoteDocument,
	rawDocument,
	textStyleDocument,
	linkDocument,
	emphasisDocument,
	lineBreakDocument,
	lineDocument,
	imageDocument,
	tableDocument,
	gridDocument,
	figureDocument,
	refDocument,
	termDocument,
	footnoteDocument,
	pageBreakDocument,
	spacingDocument,
	outlineDocument,
	setRuleDocument,
	loremDocument,
	symbolDocument,
	pictureDocument,
	elementDocument,
	stackDocument,
	quietDocument,
	dateDocument,
	printedCodeDocument
];
