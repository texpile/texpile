import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readElement } from './elementCall';

export const elementDocument: TypstDocumentPlugin = { import: { chips: (source) => readElement(source.trim()) !== null } };
