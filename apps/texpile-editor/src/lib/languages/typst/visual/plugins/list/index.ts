import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { listDocument } from './document';
import { listInserts } from './listInsert';

export const list: TypstPlugin = { document: listDocument, insert: listInserts };
