import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readStack } from './stackCall';

export const stackDocument: TypstDocumentPlugin = { import: { chips: (source) => readStack(source.trim()) !== null } };
