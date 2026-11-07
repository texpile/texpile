// a chip that is one call of an image: the file it shows, and the width and height it gives
import { roleOf } from '$lib/languages/typst/knowledge';
import {
	fieldText,
	positionalArgs,
	readStdUse,
	sizeOf,
	typstScopeOfDrawing,
	type ImageDrawing
} from '$lib/languages/typst/visual/core/document';

export function readImage(source: string): ImageDrawing | null {
	const use = readStdUse(source);
	const [first] = use ? positionalArgs(use.call) : [];
	if (!use || use.entry.group !== 'visualize' || !first || roleOf(use.entry, { index: 0 }) !== 'file') return null;
	const path = fieldText({ node: first.node, source: use.call.source }, typstScopeOfDrawing(use.source));
	return path ? { path: path.replace(/^\/+/, ''), width: sizeOf(use.call, 'width'), height: sizeOf(use.call, 'height') } : null;
}
