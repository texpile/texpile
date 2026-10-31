import { expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

it('copied CeTZ calls paste as statements, and words as a text', () => {
	expect(lang.isStatements('rect((0, 0), (2, 1), name: "n1")\ncontent("n1", [A])')).toBe(true);
	expect(lang.isStatements('draw.line((0, 0), (1, 1))')).toBe(true);
	expect(lang.isStatements('Speed (in m/s)')).toBe(false);
});
