// a package's value or call drawn as what the package data says it prints: a value or a call as its text, one that
// prints nothing as a quiet note of its name
import { faceOf, printedBy, readPackageUse, typstScopeOfDrawing, type ChipFace } from '$lib/languages/typst/visual/core';

/** `drawByName` draws a source of Typst's own, which a package value written in it (`h(12pt)`) is drawn as */
export function packageFace(source: string, drawByName: (source: string) => ChipFace | null): ChipFace | null {
	const written = source.trim();
	const use = readPackageUse(written, typstScopeOfDrawing(written));
	if (!use) return null;
	const value = use.found.entry.value;
	const drawn = value && !use.call ? drawByName(`#${value}`) : null;
	if (drawn) return drawn;
	// a block-level call prints a layout of its own (a CV entry, a title page), which its words alone misdraw
	const text = use.found.entry.block === true ? null : printedBy(use);
	if (text === null) return null;
	return text.trim() ? faceOf(text, 'drawn-typst-printed', written) : faceOf(use.name, 'drawn-typst-quiet', written);
}
