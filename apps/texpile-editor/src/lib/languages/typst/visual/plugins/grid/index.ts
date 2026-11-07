import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { gridDocument } from './document';
import { gridInserts } from './gridInsert';

export const grid: TypstPlugin = { document: gridDocument, views: (setup) => ({ typ_grid: setup.layout }), insert: gridInserts };
