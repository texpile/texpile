import { describe, expect, it } from 'vitest';
import { argumentAt, callsIn } from '$lib/languages/latex/knowledge/calls/commandCalls';

const keys = (text: string) =>
	callsIn(text, ['citekey']).flatMap((c) => c.args.filter((a) => a.arg.role === 'citekey').flatMap((a) => a.values.map((v) => v.value)));

describe('calls by role', () => {
	it('reads the keys past the notes of the widest reading, and every repeated group', () => {
		expect(keys('\\cite[see][p. 2]{a, b} and \\cites(all)()[x]{c}[y][z]{d} \\nocite{e}')).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('reads calls nested in another call, a beamer overlay, and a label wrapped over two lines', () => {
		const labels = (text: string) =>
			callsIn(text, ['label']).flatMap((c) => c.args.filter((a) => a.arg.role === 'label').flatMap((a) => a.values.map((v) => v.value)));
		expect(labels('\\hyperref[sec:a]{Section~\\ref{sec:b}} \\label{fig: phase\n diagrams}')).toEqual([
			'sec:a',
			'sec:b',
			'fig: phase diagrams'
		]);
		expect(keys('\\cite<2->[p. 3]{k}')).toEqual(['k']);
	});

	it('reads many unclosed calls in linear time', () => {
		const text = '\\label{eq:x\n'.repeat(20000);
		const started = performance.now();
		callsIn(text, ['label']);
		expect(performance.now() - started).toBeLessThan(2000);
	});

	it('finds the argument the cursor is in', () => {
		expect(argumentAt('\\cref{fig:a,fig:b', ['label'])?.value.value).toBe('fig:b');
		expect(argumentAt('\\textbf{fig', ['label'])).toBeNull();
	});
});
