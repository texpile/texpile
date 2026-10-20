import { describe, expect, it } from 'vitest';
import { agentEditProblem, knownCiteKeys } from '$lib/ai/agentEditGuard';

describe('agentEditProblem', () => {
	const known = knownCiteKeys(String.raw`\bibitem{inline} \cite{used}`, ['bibkey']);

	it('refuses a key in a later group of a multicite that no source has', () => {
		const after = String.raw`See \parencites[1]{bibkey}[2]{invented}.`;
		expect(agentEditProblem('tex', 'See.', after, known)).toEqual({ invented: ['invented'] });
	});

	it('reads no key out of a command that only has cite in its name, and lets a \\bibitem key through', () => {
		const after = String.raw`\setcitestyle{round} \citeleft{(} \cite{inline}`;
		expect(agentEditProblem('tex', 'text', after, known)).toBeNull();
	});

	it('refuses a rewrite that loses a label', () => {
		expect(agentEditProblem('tex', String.raw`\label{sec:a} text`, 'text', known)).toEqual({ lost: ['sec:a'] });
	});
});
