import { describe, expect, it } from 'vitest';
import { callsIn } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { ownCommandReadings } from '$lib/languages/latex/knowledge/calls/ownCommands';

describe('own commands', () => {
	it('reads a wrapper argument as the argument it is passed to', () => {
		const own = ownCommandReadings([
			{ name: 'figref', args: [{ kind: 'm' }], body: 'Figure~\\ref{fig:#1}' },
			{ name: 'eqs', args: [{ kind: 'o' }, { kind: 'm' }], body: '\\cref{#2}' }
		]);
		expect(Object.keys(own)).toEqual(['eqs']);
		const calls = callsIn('see \\eqs[x]{a,b} and \\ref{c}', ['label'], own);
		expect(calls.map((c) => [c.command, c.args.find((a) => a.arg.role === 'label')?.values.map((v) => v.value)])).toEqual([
			['eqs', ['a', 'b']],
			['ref', ['c']]
		]);
	});

	it('numbers the parameters as xparse does, a star included', () => {
		const own = ownCommandReadings([{ name: 'xref', args: [{ kind: 's' }, { kind: 'm' }], body: '\\IfBooleanT{#1}{*}\\ref{#2}' }]);
		expect(own.xref.args.map((a) => a.role ?? null)).toEqual([null, 'label']);
	});
});
