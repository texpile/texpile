import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { quoteDocument } from './document';
import { quoteInserts } from './quoteInsert';

export const quote: TypstPlugin = { document: quoteDocument, insert: quoteInserts };
