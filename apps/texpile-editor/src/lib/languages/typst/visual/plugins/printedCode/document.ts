import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readPrinted } from './printedCall';

export const printedCodeDocument: TypstDocumentPlugin = { import: { chips: (source) => readPrinted(source.trim()) !== null } };
