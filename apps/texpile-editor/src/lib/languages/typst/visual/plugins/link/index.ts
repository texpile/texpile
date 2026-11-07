import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { linkDocument } from './document';

export const link: TypstPlugin = { document: linkDocument };
