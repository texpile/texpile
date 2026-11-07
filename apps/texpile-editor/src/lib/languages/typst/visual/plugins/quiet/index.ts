import type { TypstPlugin, TypstUse } from '$lib/languages/typst/visual/core';
import { quietFace } from './quietFace';
import { quietDocument } from './document';

/** a call of Typst's own that prints nothing or can leave its citation out, or a method on a value one makes */
function mayBeQuiet(use: TypstUse): boolean {
	if (use.form !== 'call') return false;
	if (/\)\.[\w-]+$/.test(use.name)) return true;
	const { entry } = use;
	return (
		use.origin === 'std' && !!entry && (!!entry.invisible || !!entry.params?.some((p) => p.name === 'form' && p.types?.includes('none')))
	);
}

export const quiet: TypstPlugin = {
	role: mayBeQuiet,
	face: ({ source }) => quietFace(source),
	document: quietDocument
};
