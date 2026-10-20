import { describe, expect, it } from 'vitest';
import { unknownOptionCheck } from '$lib/languages/latex/intellisense/checks/rules/unknownOptionCheck';
import { checkInput } from '../checkInput';

describe('unknownOptionCheck', () => {
	it('warns about a misspelled package option, on the option', async () => {
		const text = '\\documentclass{article}\n\\usepackage[colorlinks, linkcolour=red]{hyperref}\n';
		const [problem, ...more] = unknownOptionCheck.run(await checkInput(text));
		expect(more).toEqual([]);
		expect(problem).toMatchObject({ anchor: 'linkcolour', at: text.indexOf('linkcolour') });
	});

	it('asks whether the nearest option was meant and offers to write it', async () => {
		const [problem] = unknownOptionCheck.run(await checkInput('\\documentclass[11ptt]{article}\n'));
		expect(problem.message).toBe('Did you mean 11pt?');
		expect(problem.fix).toEqual({ kind: 'replace-text', text: '11pt' });
	});

	it('leaves an option unlike any the data lists, which the data may have missed', async () => {
		const text = '\\documentclass{article}\n\\usepackage[usenames]{xcolor}\n';
		expect(unknownOptionCheck.run(await checkInput(text))).toEqual([]);
	});

	it('takes a class option that a loaded package takes, and warns about one nothing takes', async () => {
		const babel = '\\documentclass[british, 11pt]{article}\n\\usepackage{babel}\n';
		expect(unknownOptionCheck.run(await checkInput(babel))).toEqual([]);
		const typo = '\\documentclass[11ptt]{article}\n';
		expect(unknownOptionCheck.run(await checkInput(typo)).map((p) => p.anchor)).toEqual(['11ptt']);
	});

	it('reads an option key without its spaces, as LaTeX does', async () => {
		const text = '\\documentclass[11 pt]{article}\n\\usepackage[colorlinks, linkco\nlor=red, linkcolour = red]{hyperref}\n';
		const problems = unknownOptionCheck.run(await checkInput(text));
		expect(problems.map((p) => p.anchor)).toEqual(['linkcolour']);
	});
});
