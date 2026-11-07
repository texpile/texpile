// what LaTeX's plugins say of the document, in schema order: ProseMirror takes its defaults from the order of the nodes
import type { LatexDocumentPlugin } from './core/plugin/latexDocumentPlugin';
import { abstractDocument } from './plugins/abstract/document';
import { headingDocument } from './plugins/heading/document';
import { quoteDocument } from './plugins/quote/document';
import { ruleDocument } from './plugins/rule/document';
import { spacingDocument } from './plugins/spacing/document';
import { tableDocument } from './plugins/table/document';
import { verbatimDocument } from './plugins/verbatim/document';
import { characterDocument } from './plugins/character/document';
import { textStyleDocument } from './plugins/textStyle/document';
import { colorDocument } from './plugins/color/document';
import { linkDocument } from './plugins/link/document';
import { floatDocument } from './plugins/float/document';
import { citationDocument } from './plugins/citation/document';
import { crossReferenceDocument } from './plugins/crossReference/document';
import { labelDocument } from './plugins/label/document';
import { includeDocument } from './plugins/include/document';
import { graphicDocument } from './plugins/graphic/document';
import { listDocument } from './plugins/list/document';
import { mathDocument } from './plugins/math/document';
import { slidesDocument } from './plugins/slides/document';
import { contentsDocument } from './plugins/contents/document';
import { titleDocument } from './plugins/title/document';
import { bibliographyDocument } from './plugins/bibliography/document';
import { pageBreakDocument } from './plugins/pageBreak/document';

export const latexDocumentPlugins: readonly LatexDocumentPlugin[] = [
	abstractDocument,
	characterDocument,
	headingDocument,
	listDocument,
	mathDocument,
	quoteDocument,
	ruleDocument,
	spacingDocument,
	tableDocument,
	textStyleDocument,
	verbatimDocument,
	colorDocument,
	linkDocument,
	pageBreakDocument,
	bibliographyDocument,
	titleDocument,
	contentsDocument,
	slidesDocument,
	graphicDocument,
	includeDocument,
	citationDocument,
	crossReferenceDocument,
	labelDocument,
	floatDocument
];
