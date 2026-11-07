import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { mathDocument } from './document';
import { mathInserts } from './mathInsert';

export const math: TypstPlugin = { document: mathDocument, insert: mathInserts };
