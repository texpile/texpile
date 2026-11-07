import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { lineBreakDocument } from './document';

export const lineBreak: TypstPlugin = { document: lineBreakDocument };
