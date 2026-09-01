// What a \ref chip prints, and when it reads as broken. The rule is that both answers come from
// the compiler, so each case here is about which of its answers wins.
import { describe, it, expect } from 'vitest';
import { refState } from '$lib/languages/latex/visual/extensions/ref/refState';

const NONE: ReadonlySet<string> = new Set();

describe('a reference chip', () => {
	it('prints the number the compile recorded', () => {
		expect(refState('ref', 'sec:intro', { 'sec:intro': '3.1' }, NONE).text).toBe('3.1');
		// \eqref supplies its own parentheses; the .aux stores the bare number either way
		expect(refState('eqref', 'eq:loss', { 'eq:loss': '7' }, NONE).text).toBe('(7)');
	});

	it('shows the label when the compile has no number for it', () => {
		expect(refState('ref', 'thm:main', {}, NONE)).toEqual({ text: 'thm:main', broken: false });
		// a label added since the last compile: other labels resolved, this one has no answer yet,
		// and an answer we do not have is not the same as a reference that points at nothing
		expect(refState('ref', 'fig:new', { 'sec:intro': '1' }, NONE)).toEqual({ text: 'fig:new', broken: false });
	});

	it('reads as broken only where the compiler said undefined', () => {
		expect(refState('ref', 'fig:typo', {}, new Set(['fig:typo'])).broken).toBe(true);
		expect(refState('ref', 'fig:other', {}, new Set(['fig:typo'])).broken).toBe(false);
	});

	// the first compile of a document reports every reference undefined, in the same run that
	// writes the labels it was looking for. Believing the warning over the .aux would paint a
	// whole paper red the moment it first built.
	it('believes the recorded number over a warning from the run that wrote it', () => {
		expect(refState('ref', 'sec:intro', { 'sec:intro': '1' }, new Set(['sec:intro']))).toEqual({ text: '1', broken: false });
	});
});
