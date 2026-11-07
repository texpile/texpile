import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { termDocument } from './document';
import { termInserts } from './termInsert';
import { termKeys } from './termKeys';

export const term: TypstPlugin = { document: termDocument, insert: termInserts, editorPlugins: { atStart: termKeys } };
