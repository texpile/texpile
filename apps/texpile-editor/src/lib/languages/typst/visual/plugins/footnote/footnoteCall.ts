// a footnote as its one setting, the note's markup (#footnote[..])
import { blockMarkup, positionalArgs, readTypstCall, rewrittenCall } from '$lib/languages/typst/visual/core/document';

export type FootnoteCall = { note: string };

export function readFootnote(source: string): FootnoteCall | null {
	const call = readTypstCall(source);
	if (!call || call.form !== 'call' || call.name !== 'footnote' || positionalArgs(call).length || call.bodies.length !== 1) return null;
	return { note: blockMarkup(call.bodies[0]) };
}

export function writeFootnote(source: string, note: string): string | null {
	const call = readTypstCall(source);
	if (!call || !readFootnote(source)) return null;
	const next = rewrittenCall(call, { body: note });
	return readFootnote(next)?.note === note ? next : null;
}
