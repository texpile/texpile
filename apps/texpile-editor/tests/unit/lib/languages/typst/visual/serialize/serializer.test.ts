import { describe, it, expect } from 'vitest';
import { argsWithLanguage } from '$lib/languages/latex/parser/listingLanguage';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema as S } from '$lib/languages/typst/visual/schema';

describe('a code block whose language was picked from the list', () => {
	it('names it with a word typst reads whole, keeping the code as typed', () => {
		for (const [name, tag] of [
			['C++', 'cpp'],
			['C#', 'cs'],
			['F#', 'fs'],
			['Common Lisp', 'common-lisp']
		]) {
			const block = S.nodes.code_block.create({ env: 'fence', lang: name, args: argsWithLanguage('fence', '', name) }, S.text('int x;'));
			const out = serializeToTypst(S.nodes.doc.create(null, [block]));
			const back = typstToProseMirror(out).doc.child(0);
			expect(back.textContent, out).toBe('int x;');
			expect(back.attrs.args, out).toBe(tag);
		}
	});
});
