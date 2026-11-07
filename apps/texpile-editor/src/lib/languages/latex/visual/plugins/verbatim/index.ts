import { verbatimCommandNames } from '$lib/languages/latex/knowledge/calls/verbatimCalls';
import { CodeBlockView, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { verbatimFace, verbatimTextOf } from './verbatimFace';
import { verbatimDocument } from './document';
import { verbatimInserts } from './verbatimInsert';

export const verbatim: LatexPlugin = {
	commands: verbatimCommandNames(),
	face(part) {
		if (part.kind !== 'verbatim') return undefined;
		const text = verbatimTextOf(part.source);
		return text === null ? null : verbatimFace(text);
	},
	document: verbatimDocument,
	views: () => ({ code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number) }),
	insert: verbatimInserts
};
