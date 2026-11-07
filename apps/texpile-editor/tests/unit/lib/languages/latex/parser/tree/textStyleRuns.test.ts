import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

// a document's last paragraph ends in the \par the serializer writes
const written = (doc: Parameters<typeof serializeToLatex>[0]) => serializeToLatex(doc).replace(/\s*\\par\s*$/, '');

function chipsOf(doc: Node): string[] {
	const out: string[] = [];
	doc.descendants((n) => void (n.type.name === 'inline_latex' && out.push(n.textContent)));
	return out;
}

describe('font and size switches', () => {
	it('reads a switch group, a bare switch and a styled argument as styled text, written back as the file had them', () => {
		const src = String.raw`Before {\small small $\mu$ words} and \textsc{Caps}, \bf 18 \large{}Hung{\large{}$\dagger$}\large{}, Dinh`;
		const { doc } = treeToProseMirror(src);
		expect(chipsOf(doc)).toEqual([]);
		expect(doc.textContent).toContain('small');
		expect(written(doc)).toBe(src);
	});

	it('keeps a switch with no prose of its own as source', () => {
		const { doc } = treeToProseMirror(String.raw`Supporting {\large\par} and {\large \guidetitle}`);
		expect(chipsOf(doc)).toEqual([String.raw`{\large\par}`, String.raw`{\large \guidetitle}`]);
	});
});
