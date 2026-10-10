// a package file of the user's own: its commands complete where the package is loaded, the parser
// takes their arguments from it, and a file drafted from a .sty reads back as one
import { afterEach, describe, expect, it } from 'vitest';
import { macroOptions } from '$lib/languages/latex/intellisense/completion/macros';
import { parsePackageFile, setUserPackages } from '$lib/languages/latex/intellisense/userPackages';
import { installedPackageDefinitions, packageFileFrom } from '$lib/languages/latex/installedPackages';

const FILE = `{
	// the review package
	"macros": [
		{ "name": "offen", "arg": { "format": "[]{}", "snippet": "offen[\${1:who}]{\${2:text}}" }, "doc": "Open point" },
		{ "name": "notarealentry" , "arg": 3 },
		7
	],
	"envs": [{ "name": "reviewbox" }]
}`;

afterEach(() => setUserPackages(new Map()));

describe('package files', () => {
	it('completes the commands only where the package is loaded', () => {
		const { contents, problem } = parsePackageFile(FILE);
		expect(problem).toBe('has 2 entries that are not the right shape');
		setUserPackages(new Map([['review', contents!]]));
		const labels = (text: string) => macroOptions(text).map((o) => o.label);
		expect(labels('\\usepackage{review}\n')).toContain('\\offen');
		expect(labels('\\usepackage{other}\n')).not.toContain('\\offen');
	});

	it('gives the parser the arguments the file names, over the .sty', async () => {
		setUserPackages(new Map([['review', parsePackageFile(FILE).contents!]]));
		const defs = await installedPackageDefinitions(['review'], async () => '\\newcommand{\\offen}[1]{}');
		expect(defs).toBe('\\NewDocumentCommand{\\offen}{o m}{}');
	});

	it('drafts a file from a .sty that reads back with the arguments of each command', () => {
		const sty =
			'\\newcommand{\\hlnote}[2][red]{#2}\n\\NewDocumentCommand{\\pt}{s m}{}\n\\newcommand{\\in@ner}{}\n\\newenvironment{todo}{}{}';
		const { contents, problem } = parsePackageFile(JSON.stringify(packageFileFrom(sty)));
		expect(problem).toBeNull();
		expect(contents!.macros).toEqual([{ name: 'hlnote', arg: { format: '[]{}', snippet: 'hlnote[${1}]{${2}}' } }, { name: 'pt' }]);
		expect(contents!.envs).toEqual([{ name: 'todo' }]);
	});
});
