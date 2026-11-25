import { slideViews } from './canvas/slideViews';
import { hasArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { pauseFace } from './pauseFace';
import { titlePageFace } from './titlePageFace.svelte';
import { slidesDocument } from './document';
import { slidePlugins } from './slidePlugin';
import { slideInserts } from './insert/slideInsert';
import { slideArguments } from './insert/slideArguments';

export const slides: LatexPlugin = {
	commands: ['pause', 'titlepage'],
	face(part, core) {
		if (part.kind !== 'command' || hasArgs(part.call)) return undefined;
		return part.name === 'pause' ? pauseFace(core.source) : titlePageFace(core.source);
	},
	document: slidesDocument,
	canvasViews: slideViews,
	editorPlugins: { atStart: slidePlugins },
	insert: slideInserts,
	arguments: slideArguments
};
