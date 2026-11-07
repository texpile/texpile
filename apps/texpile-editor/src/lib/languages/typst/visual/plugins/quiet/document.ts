import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readQuiet } from './quietCall';

export const quietDocument: TypstDocumentPlugin = { import: { chips: (source) => readQuiet(source.trim()) !== null } };
