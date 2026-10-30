// \chapter and \part show as level-1 headings, and regenerated as \section: a book lost its
// chapter structure on the first edit of any heading.
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('\\chapter and \\part', () => {
	it.each(['\\chapter{Intro}', '\\chapter*{Preface}', '\\part{One}'])('%s regenerates as itself', (heading) => {
		expect(rt(`${heading}\n\nText.`)).toContain(heading);
	});

	it('\\section is untouched', () => {
		expect(rt('\\section{S}\n\nText.')).toContain('\\section{S}');
	});
});
