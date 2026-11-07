import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readSetRule } from '$lib/languages/typst/visual/core/document';

export const setRuleDocument: TypstDocumentPlugin = { import: { chips: (source) => readSetRule(source) !== null } };
