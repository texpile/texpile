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
	it('completes the commands only where the package is loaded', async () => {
		const { contents, problem } = parsePackageFile(FILE);
		expect(problem).toMatch(/^2 of its entries/);
		setUserPackages(new Map([['review', contents!]]));
		const labels = async (text: string) => (await macroOptions(text)).map((o) => o.label);
		expect(await labels('\\usepackage{review}\n')).toContain('\\offen');
		expect(await labels('\\usepackage{other}\n')).not.toContain('\\offen');
	});

	it('reports a dependency whose engines it does not know', () => {
		const { contents, problem } = parsePackageFile(
			'{ "deps": [{ "name": "fontspec", "engines": ["luatex"] }, { "name": "xcolor", "engines": ["lualatex"] }] }'
		);
		expect(problem).toMatch(/^1 of its entries/);
		expect(contents?.deps).toEqual([{ name: 'xcolor', engines: ['lualatex'] }]);
	});

	it('gives the parser the arguments the file names, over what TeX reports', async () => {
		setUserPackages(new Map([['review', parsePackageFile(FILE).contents!]]));
		const defs = await installedPackageDefinitions([{ name: 'review', options: '' }], '', async () => ({
			commands: [{ name: 'offen', spec: 'm' }]
		}));
		expect(defs).toBe('\\NewDocumentCommand{\\offen}{o m}{}');
	});

	it('gives the parser the arguments of a bundled package without asking TeX', async () => {
		let asked = false;
		const defs = await installedPackageDefinitions([{ name: 'marginnote', options: '' }], '', async () => {
			asked = true;
			return null;
		});
		expect(defs).toContain('\\NewDocumentCommand{\\marginnote}{o m o}{}');
		expect(asked).toBe(false);
	});

	it('leaves a command two loaded packages define differently to the parser', async () => {
		const loaded = async (...names: string[]) =>
			installedPackageDefinitions(
				names.map((name) => ({ name, options: '' })),
				'',
				async () => null
			);
		expect(await loaded('algorithm2e')).toContain('\\NewDocumentCommand{\\For}{d() m m d()}{}');
		expect(await loaded('algorithm2e', 'algpseudocode')).not.toMatch(/\{\\For\}/);
	});

	it("keeps a package's arguments where the class defines the command differently", async () => {
		const defs = await installedPackageDefinitions(
			[
				{ name: 'class-revtex4-2', options: '' },
				{ name: 'booktabs', options: '' }
			],
			'',
			async () => null
		);
		expect(defs).toContain('\\NewDocumentCommand{\\toprule}{o}{}');
	});

	it('keeps \\verb-prefixed names out of the definitions, which the tokenizer would read as \\verb', async () => {
		const defs = await installedPackageDefinitions([{ name: 'verbatim', options: '' }], '', async () => null);
		expect(defs).not.toMatch(/\\verb/);
	});

	it('drafts a file from what TeX reports for the package itself, environments apart', () => {
		const probe = {
			commands: [
				{ name: 'hlnote', spec: 'o m', own: true },
				{ name: 'pt', spec: 'X s m', own: true },
				{ name: 'celsius', spec: '', own: true },
				{ name: 'todo', spec: 'm', own: true },
				{ name: 'endtodo', spec: '', own: true },
				{ name: 'tikzset', spec: 'm' }
			]
		};
		const { contents, problem } = parsePackageFile(JSON.stringify(packageFileFrom(probe)));
		expect(problem).toBeNull();
		expect(contents!.macros).toEqual([
			{ name: 'celsius' },
			{ name: 'hlnote', arg: { format: '[]{}', snippet: 'hlnote[${1}]{${2}}' } },
			{ name: 'pt', arg: { format: '{}', snippet: 'pt{${1}}' } }
		]);
		expect(contents!.envs).toEqual([{ name: 'todo', arg: { format: '{}', snippet: '{${1}}' } }]);
	});
});
