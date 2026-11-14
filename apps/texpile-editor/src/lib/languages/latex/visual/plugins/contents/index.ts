import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { contentsDocument } from './document';
import { contentsInserts } from './contentsInsert';

export const contents: LatexPlugin = { document: contentsDocument, insert: contentsInserts };
