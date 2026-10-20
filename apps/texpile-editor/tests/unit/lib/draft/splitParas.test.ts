import { describe, expect, it } from 'vitest';
import { splitParas } from '$lib/draft/heuristics/splitParas';

describe('splitParas boundaries', () => {
	it('a part line and a class heading end the paragraph above them', () => {
		const paras = splitParas('text a\n\\part{P}\ntext b\n\\specialsection{S}\ntext c');
		expect(paras.map((p) => p.text)).toEqual(['text a', 'text b', 'text c']);
	});
});
