import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readOutline } from './outlineCall';

export const outlineDocument: TypstDocumentPlugin = { import: { chips: (source) => readOutline(source) !== null } };
