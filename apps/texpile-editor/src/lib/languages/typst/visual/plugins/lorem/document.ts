import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readLorem } from '$lib/languages/typst/visual/core/document';

export const loremDocument: TypstDocumentPlugin = { import: { chips: (source) => readLorem(source) !== null } };
