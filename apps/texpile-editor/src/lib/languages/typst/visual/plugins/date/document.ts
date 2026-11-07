import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readDate } from './dateCall';

export const dateDocument: TypstDocumentPlugin = { import: { chips: (source) => readDate(source.trim()) !== null } };
