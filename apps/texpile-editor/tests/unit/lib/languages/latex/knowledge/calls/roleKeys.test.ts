import { describe, expect, it } from 'vitest';
import { keysIn, optionalsBeforeKey } from '$lib/languages/latex/knowledge/calls/roleKeys';

describe('keysIn', () => {
	it('separates the keys a call defines from the ones it uses, and marks \\nocite{*}', () => {
		const text = String.raw`\label{sec:a} \ref{sec:a} \bibitem[A(1)]{b1} \cite{b1, b2} \nocite{*}`;
		expect(keysIn(text, 'label', true).map((k) => k.key)).toEqual(['sec:a']);
		expect(keysIn(text, 'citekey', true).map((k) => k.key)).toEqual(['b1']);
		expect(keysIn(text, 'citekey', false).map((k) => [k.key, k.wildcard])).toEqual([
			['b1', false],
			['b2', false],
			['*', true]
		]);
	});
});

describe('optionalsBeforeKey', () => {
	it('counts the notes a citation command takes, and says null for a command the data does not know', () => {
		expect([optionalsBeforeKey('cite'), optionalsBeforeKey('supercite'), optionalsBeforeKey('mycite')]).toEqual([2, 0, null]);
	});
});
