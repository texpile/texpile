import { describe, expect, it } from 'vitest';
import { expandOwnMacro, ownMacroCallsIn, readOwnMacroCall } from '$lib/languages/latex/visual/extensions/drawn/ownMacro/ownMacroCall';

const note = { def: '\\textcolor{#1}{#2}', args: 2, optional: 'red' };

describe('a call of the paper’s own macro', () => {
	it('prints its arguments, an optional one left out as its default', () => {
		const plain = readOwnMacroCall('\\note{needs a citation}', note)!;
		expect(plain.args).toEqual([null, { text: 'needs a citation', from: 6, to: 22, braced: true }]);
		expect(expandOwnMacro(note, plain)).toBe('\\textcolor{red}{needs a citation}');
		const given = readOwnMacroCall('\\note [blue]{a {b}}', note)!;
		expect(expandOwnMacro(note, given)).toBe('\\textcolor{blue}{a {b}}');
		expect(readOwnMacroCall('\\note{a} more', note)).toBeNull();
	});

	it('is found at each use in a formula, with or without braces', () => {
		const den = { def: '|#1\\rangle\\langle#1|', args: 1 };
		const latex = '\\den\\psi + \\den{\\phi_1} \\\\den x % \\den{y}\n+ \\dent';
		const calls = ownMacroCallsIn(latex, 'den', () => den).map((c) => latex.slice(c!.from, c!.to));
		expect(calls).toEqual(['\\den\\psi', '\\den{\\phi_1}']);
	});

	it('leaves out a call inside another own macro, which MathLive draws no box for', () => {
		const one = { def: '|#1|', args: 1 };
		const own = (name: string) => (name === 'den' || name === 'foo' ? one : null);
		const latex = '\\den{\\den{\\psi}} + \\foo{\\den{x}} + \\frac{\\den{y}}{2}';
		const calls = ownMacroCallsIn(latex, 'den', own).map((c) => latex.slice(c!.from, c!.to));
		expect(calls).toEqual(['\\den{\\den{\\psi}}', '\\den{y}']);
	});
});
