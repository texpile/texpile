import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { titleDocument } from './document';
import { titleInserts } from './titleInsert';

export const title: LatexPlugin = { document: titleDocument, insert: titleInserts };
