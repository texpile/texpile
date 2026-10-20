import { describe, expect, it } from 'vitest';
import { packageClashCheck } from '$lib/languages/latex/intellisense/checks/rules/packageClashCheck';
import { checkInput } from '../checkInput';

const document = (packages: string[]) => `\\documentclass{article}\n${packages.map((p) => `\\usepackage{${p}}\n`).join('')}`;

describe('packageClashCheck', () => {
	it('warns about hyperref after cleveref, on hyperref, and names cleveref', async () => {
		const text = document(['cleveref', 'hyperref']);
		const [problem, ...more] = packageClashCheck.run(await checkInput(text));
		expect(more).toEqual([]);
		expect(problem).toMatchObject({ anchor: 'hyperref', at: text.indexOf('hyperref') });
		expect(problem.message).toBe('Load hyperref before cleveref.');
	});

	it('offers to move hyperref above cleveref when both stand on lines of their own', async () => {
		const [problem] = packageClashCheck.run(await checkInput(`${document(['cleveref', 'hyperref'])}\\begin{document}\n`));
		expect(problem.fix).toEqual({ kind: 'move-package', first: 'hyperref', second: 'cleveref' });
		const [inline] = packageClashCheck.run(
			await checkInput('\\documentclass{article}\n\\usepackage{cleveref} \\usepackage{hyperref}\n\\begin{document}\n')
		);
		expect(inline.fix).toBeUndefined();
	});

	it('accepts the order that loads', async () => {
		expect(packageClashCheck.run(await checkInput(document(['hyperref', 'cleveref'])))).toEqual([]);
	});

	it('does not flag mathtools after cleveref when amsmath came first', async () => {
		expect(packageClashCheck.run(await checkInput(document(['amsmath', 'cleveref', 'mathtools'])))).toEqual([]);
	});

	it('reports one clash once when a package that loads the clashing one follows', async () => {
		const problems = packageClashCheck.run(await checkInput(document(['cleveref', 'amsmath', 'mathtools'])));
		expect(problems.map((p) => p.anchor)).toEqual(['amsmath']);
	});

	it('flags a package loaded twice at its first use only', async () => {
		const text = document(['txfonts', 'amsthm', 'amsthm']);
		const problems = packageClashCheck.run(await checkInput(text));
		expect(problems.map((p) => p.at)).toEqual([text.indexOf('amsthm')]);
	});

	it('names the package the document wrote when the clash comes in through another', async () => {
		const [problem] = packageClashCheck.run(await checkInput(document(['algpseudocode', 'algorithmic'])));
		expect(problem.anchor).toBe('algorithmic');
		expect(problem.message).toContain('algpseudocode');
		expect(problem.message).not.toContain('algorithmicx');
	});
});
