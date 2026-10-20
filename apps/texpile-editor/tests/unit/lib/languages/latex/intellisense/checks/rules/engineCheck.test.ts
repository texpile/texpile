import { describe, expect, it } from 'vitest';
import { engineCheck } from '$lib/languages/latex/intellisense/checks/rules/engineCheck';
import { checkInput } from '../checkInput';

const text = '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{fontspec}\n';

describe('engineCheck', () => {
	it('warns about fontspec under pdflatex on the package name', async () => {
		const [problem, ...more] = engineCheck.run(await checkInput(text, { engine: 'pdflatex' }));
		expect(more).toEqual([]);
		expect(problem).toMatchObject({ anchor: 'fontspec', at: text.indexOf('fontspec') });
	});

	it('accepts the engines the package runs under and an unknown engine', async () => {
		expect(engineCheck.run(await checkInput(text, { engine: 'xelatex' }))).toEqual([]);
		expect(engineCheck.run(await checkInput(text, { engine: null }))).toEqual([]);
	});
});
