import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readSymbol } from './symbolCall';

export const symbolDocument: TypstDocumentPlugin = { import: { chips: (source) => readSymbol(source) !== null } };
