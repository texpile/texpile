import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { abstractDocument } from './document';
import { abstractInserts } from './abstractInsert';

export const abstract: LatexPlugin = { document: abstractDocument, insert: abstractInserts };
