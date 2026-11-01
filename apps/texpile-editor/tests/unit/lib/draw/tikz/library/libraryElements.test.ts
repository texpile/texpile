// the drawn check needs lualatex, and is skipped without it
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../engines/lualatexEngine';
import { LIBRARY_ELEMENTS } from '$lib/draw/tikz/library/libraryElements';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { elementPreamble } from './elementPreamble';

const DOCUMENT =
	'\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,0);\n\\end{tikzpicture}\n\\end{document}\n';

describe('the library', () => {
	it('adds each element with what it needs, and each can be put where it is dropped', () => {
		for (const e of LIBRARY_ELEMENTS) {
			const added = tikzLanguage.addElement(DOCUMENT, 0, e)!;
			const picture = readPicture(added)!;
			const fresh = picture.statements.filter((s) => s.i > 1 && !s.inScope);
			expect(fresh.length, e.id).toBeGreaterThan(0);
			for (const st of fresh) {
				expect(tikzLanguage.describe(added, st).movable, `${e.id}: ${added.slice(st.from, st.to)}`).toBe(true);
				expect(tikzLanguage.shiftStatement(added, st, 2, 1), e.id).not.toBe(added);
			}
			if (e.usepackage) expect(added).toContain(`\\usepackage{${e.usepackage}}`);
			for (const l of e.libraries) expect(added).toMatch(new RegExp(`\\\\usetikzlibrary\\{[^}]*${l}`));
		}
	});

	useLualatex();
	it.skipIf(!hasLualatex)(
		'draws each element without an error',
		async () => {
			for (const e of LIBRARY_ELEMENTS) {
				const text = `\\begin{tikzpicture}\n${e.text}\n\\end{tikzpicture}`;
				const result = await drawWithLualatex(elementPreamble(e), instrumentPicture(text, readPicture(text)!));
				expect(result.errors, e.id).toEqual([]);
				expect(result.recs.length, e.id).toBeGreaterThan(0);
			}
		},
		120_000
	);
});
