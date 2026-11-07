import type { TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { readPicture } from './pictureCall';

export const pictureDocument: TypstDocumentPlugin = { import: { chips: (source) => readPicture(source) !== null } };
