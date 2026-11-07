import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readSpacing } from './spacingCall';

export const spacingDocument: TypstDocumentPlugin = { import: { chips: (source) => readSpacing(source) !== null } };
