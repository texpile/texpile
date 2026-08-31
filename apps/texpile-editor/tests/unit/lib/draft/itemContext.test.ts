import { describe, expect, it } from 'vitest';
import { decideEdit } from '$lib/draft/heuristics/dispatch';

// The live harness reported `para-count` for a bare \item on the torture fixture while the
// minimal document dispatched it as a patch. One of the two is lying about what the product
// does, so this reproduces the fixture's actual surroundings rather than a reduction of them.
const DOC = [
	'\\documentclass[10pt,twocolumn]{article}',
	'\\begin{document}',
	'Lists are ordinary vertical material too, though the source-line stamp riding each line is',
	'attached at paragraph boundaries and is therefore wrong inside a list item.',
	'',
	'\\begin{itemize}',
	'\\item A bulleted item behaves as a short paragraph with a label box fixed at its left.',
	'\\item Its interior lines break exactly as running text would at the same measure.',
	'\\item The label never re-breaks, so it contributes a constant height to the column.',
	'\\end{itemize}',
	'',
	'Numbered lists behave the same way, with the wrinkle that their counters are pinned from the',
	"compiler's own log rather than recounted by scanning source lines for item markers.",
	'\\end{document}',
	''
].join('\n');

const ANCHOR = '\\item A bulleted item behaves as a short paragraph with a label box fixed at its left.';

describe('a bullet typed into a real list', () => {
	it('dispatches a bare \\item as a patch, not a full pass', () => {
		expect(decideEdit(DOC, DOC.replace(ANCHOR, ANCHOR + '\n\\item')).kind).toBe('patch');
	});

	it('dispatches "\\item " with the editor-inserted space as a patch', () => {
		expect(decideEdit(DOC, DOC.replace(ANCHOR, ANCHOR + '\n\\item ')).kind).toBe('patch');
	});

	it('dispatches a bullet typed at the END of the list as a patch', () => {
		const last = '\\item The label never re-breaks, so it contributes a constant height to the column.';
		expect(decideEdit(DOC, DOC.replace(last, last + '\n\\item ')).kind).toBe('patch');
	});

	it('dispatches the bullet once it has text', () => {
		expect(decideEdit(DOC, DOC.replace(ANCHOR, ANCHOR + '\n\\item A fourth bullet.')).kind).toBe('patch');
	});
});
