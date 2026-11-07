import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { textStyleDocument } from './document';

export const textStyle: TypstPlugin = { document: textStyleDocument };
