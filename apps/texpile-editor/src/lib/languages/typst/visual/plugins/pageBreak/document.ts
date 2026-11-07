import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readBreak } from './breakCall';

export const pageBreakDocument: TypstDocumentPlugin = { import: { chips: (source) => readBreak(source) !== null } };
