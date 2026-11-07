import { fieldText, typstScopeOfDrawing, blockMarkup, positionalArgs, readStdUse } from '$lib/languages/typst/visual/core/document';

export function readNoteFootnote(source: string): string | null {
	const use = readStdUse(source);
	const [note, ...more] = use ? positionalArgs(use.call) : [];
	if (use?.call.name !== 'footnote' || !note || more.length || use.call.bodies.length || use.call.args.length !== 1) return null;
	if (note.kind === 'Label') return null;
	if (note.kind === 'ContentBlock') return blockMarkup(note);
	return fieldText({ node: note.node, source: use.call.source }, typstScopeOfDrawing(use.source));
}
