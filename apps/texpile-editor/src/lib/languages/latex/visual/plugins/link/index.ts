import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { linkDocument } from './document';

export const link: LatexPlugin = { document: linkDocument };
