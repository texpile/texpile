import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { quoteDocument } from './document';
import { quoteInserts } from './quoteInsert';

export const quote: LatexPlugin = { document: quoteDocument, insert: quoteInserts };
