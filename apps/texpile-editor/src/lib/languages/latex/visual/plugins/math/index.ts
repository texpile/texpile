import type { LatexPlugin } from '$lib/languages/latex/visual/core';
import { mathDocument } from './document';
import { mathInserts } from './mathInsert';
import { displayParagraphKeys } from './paragraph/displayParagraphKeys';
import { displayPlacement } from './paragraph/displayPlacement';
import './paragraph/displayParagraph.css';

export const math: LatexPlugin = {
	document: mathDocument,
	insert: mathInserts,
	editorPlugins: { atStart: () => [displayPlacement, displayParagraphKeys] }
};
