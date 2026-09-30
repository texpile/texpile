// What the visual editor does with INVALID typst.
//
// typst's parser is error-recovering - broken code arrives as Error nodes inside a valid tree,
// never as a thrown failure - so the questions worth pinning are ours, not the parser's:
//   1. does the converter survive every breakage without throwing,
//   2. is a NO-EDIT save still byte-identical (the verbatim layer should guarantee this
//      regardless of parse quality),
//   3. does regeneration (what an EDITED block goes through) reach a fixed point, or does a
//      damaged construct drift a little more on every save?
import { describe, it, expect } from 'vitest';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';

const roundtrip = (src: string): string => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
};

/** regeneration, the same way visualRoundtrip.test.ts does it: no norm data, every block re-emits */
const regenerate = (src: string): string => serializeToTypst(typstToProseMirror(src).doc);

const BROKEN: Record<string, string> = {
	unclosedParen: '#let x = (1 +\n\nA paragraph after.\n',
	unclosedStrong: 'Some *bold that never closes\n\nNext paragraph.\n',
	unclosedBracket: '#align(center)[unclosed content\n\nMore text.\n',
	unclosedString: '#image("logo.png\n\nAfter.\n',
	unclosedMath: 'Inline $x^2 with no closing dollar\n\nAfter.\n',
	unclosedFence: '```python\ndef f():\n    return 1\n\nno closing fence\n',
	danglingHash: 'A paragraph with a dangling # here.\n',
	badTable: '#table(columns: (auto,,), [a], [b]\n\nAfter.\n',
	halfEdited: '#figure(\n  image("a.png"),\n  caption: [unfinished\n',
	garbage: '#### ==== $$$$ ]]]] }}}}\n',
	emptyBody: '#heading(\n',
	mixedValid: '= Good heading\n\n#let broken = (\n\n== Another good heading\n\nFine paragraph.\n'
};

describe('what broken code becomes on screen', () => {
	it('a raw island whose size is typst error recovery, not ours', () => {
		// The blast radius belongs to the parser: an unclosed '(' swallows everything after it
		// into the code expression, so the island holds the REST OF THE FILE - later headings
		// included, byte-exact but demoted to source until the delimiter is fixed. Content
		// before the damage stays richly modelled.
		const { doc } = typstToProseMirror(BROKEN.mixedValid);
		const types: string[] = [];
		doc.forEach((n) => types.push(n.type.name));
		expect(types).toEqual(['heading', 'raw_latex']);
		expect(doc.child(1).textContent).toBe('#let broken = (\n\n== Another good heading\n\nFine paragraph.');
	});

	it('localized damage makes a localized island', () => {
		// a dangling '#' hurts only its own paragraph; here it is not even that - typst reads
		// '# ' as literal text, so the paragraph stays a paragraph
		const { doc } = typstToProseMirror(BROKEN.danglingHash);
		const types: string[] = [];
		doc.forEach((n) => types.push(n.type.name));
		expect(types).toEqual(['paragraph']);
	});
});

describe('invalid typst in the visual editor', () => {
	for (const [name, src] of Object.entries(BROKEN)) {
		it(`${name}: parses without throwing and a no-edit save is byte-identical`, () => {
			expect(roundtrip(src)).toBe(src);
		});

		it(`${name}: regeneration reaches a fixed point`, () => {
			const once = regenerate(src);
			const twice = regenerate(once);
			expect(twice).toBe(once);
		});
	}
});
