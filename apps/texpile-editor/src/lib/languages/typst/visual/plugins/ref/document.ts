import type { SyntaxNode } from '@lezer/common';
import { noteSpans, standsFor, type PmMark, type TypstDocumentPlugin, type TypstImport } from '$lib/languages/typst/visual/core/document';
import { refCallParts, refMarkupParts } from './refImport';
import { spelledAs, typRefSpelling } from './refSpelling';
import { typRefSpec } from './refSchema';

function refMarkup(im: TypstImport, nodes: SyntaxNode[], i: number, marks: PmMark[]) {
	const k = nodes[i];
	const ref = refMarkupParts(k, im.src);
	if (!ref) return null;
	const node = im.core.withMarks(noteSpans(im.core.node('typ_ref', ref), standsFor(1, k.from, k.to)), marks);
	return { nodes: [spelledAs(node, im.src.slice(k.from, k.to))], next: i + 1 };
}

// `#ref(<target>)` is also what the serializer writes where the next character would extend `@target`
function refCall(im: TypstImport, hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]) {
	const parts = refCallParts(call, im.src);
	if (!parts) return null;
	const ref = im.core.withMarks(noteSpans(im.core.node('typ_ref', parts), standsFor(1, hash.from, call.to)), marks);
	return [spelledAs(ref, im.src.slice(hash.from, call.to))];
}

export const refDocument: TypstDocumentPlugin = {
	import: { markup: { inline: { Ref: refMarkup } }, calls: { inline: { cite: refCall, ref: refCall } } },
	schema: ({ nodes, marks }) => ({ nodes: nodes.addBefore('typ_env', 'typ_ref', typRefSpec), marks }),
	save: {
		inline: {
			typ_ref(node, run) {
				// a supplement's `]` or a call's `)` ends the reference; only the bare marker reads on
				const spelling = typRefSpelling(node);
				return { content: run.shadowed(node, spelling.text), marks: run.marks(node.marks), kind: spelling.plain ? 'ref' : 'other' };
			}
		}
	}
};
