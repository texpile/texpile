import { describe, expect, it } from 'vitest';
import { environmentLook } from '$lib/languages/latex/visual/extensions/environment/environmentLook';

const heads = {
	lemma: { text: 'Lemma', style: 'plain' as const, numbered: true },
	proof: { text: 'Proof', style: 'definition' as const, numbered: false }
};

describe('environment look', () => {
	it('prints a theorem head with its note, and a proof note as the whole head', () => {
		expect(environmentLook('lemma', '[Main]', heads)).toEqual({ kind: 'theorem', head: 'Lemma', note: 'Main', style: 'plain' });
		expect(environmentLook('proof', '[Proof of Lemma 2]', heads)).toEqual({ kind: 'proof', head: 'Proof of Lemma 2' });
	});

	it('draws what it has no head for as a box', () => {
		expect(environmentLook('center', '', heads)).toEqual({ kind: 'align', align: 'center' });
		expect(environmentLook('minipage', '{0.5\\textwidth}', heads)).toEqual({ kind: 'box', label: 'minipage' });
	});
});
