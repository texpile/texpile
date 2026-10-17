import { afterEach, describe, expect, it } from 'vitest';
import { macroOptions } from '$lib/languages/latex/intellisense/completion/macros';
import { parsePackageFile, setProbedFiles, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';
import { packageFileFrom, probeInstalledPackages } from '$lib/languages/latex/installedPackages';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';

const FILE = `{
	// the review package
	"version": 1,
	"macros": [
		{ "name": "offen", "args": [{ "kind": "o", "placeholder": "who" }, { "kind": "m", "placeholder": "text" }], "doc": "Open point" },
		{ "name": "notarealentry" , "args": 3 },
		7
	],
	"envs": [{ "name": "reviewbox" }]
}`;

afterEach(() => {
	setUserFiles(new Map());
	setProbedFiles({});
});

async function tableOf(...names: string[]) {
	return packageTableOf(
		await loadedPackages(
			names.map((name) => ({ name, options: [] })),
			true
		)
	);
}

async function probed(name: string): Promise<boolean> {
	let asked = false;
	await probeInstalledPackages([{ name, options: '' }], '', async () => {
		asked = true;
		return null;
	});
	return asked;
}

describe('package files', () => {
	it('completes the commands only where the package is loaded', async () => {
		const { contents, problem } = parsePackageFile(FILE);
		expect(problem).toMatch(/^2 of its entries/);
		setUserFiles(new Map([['review', [contents!]]]));
		const labels = async (text: string) => (await macroOptions(text)).map((o) => o.label);
		expect(await labels('\\usepackage{review}\n')).toContain('\\offen');
		expect(await labels('\\usepackage{other}\n')).not.toContain('\\offen');
	});

	it('reports a dependency whose engines it does not know', () => {
		const { contents, problem } = parsePackageFile(
			'{ "version": 1, "deps": [{ "id": "packages/fontspec", "engines": ["luatex"] }, { "id": "packages/xcolor", "engines": ["lualatex"] }] }'
		);
		expect(problem).toMatch(/^1 of its entries/);
		expect(contents?.deps).toEqual([{ id: 'packages/xcolor', engines: ['lualatex'] }]);
	});

	it('turns away a file in the old format', () => {
		const { contents, problem } = parsePackageFile(
			'{ "macros": [{ "name": "offen", "arg": { "format": "{}", "snippet": "offen{${1}}" } }] }'
		);
		expect(contents).toBeNull();
		expect(problem).toMatch(/old package file format/);
	});

	it('gives the parser the arguments the file names, without asking TeX', async () => {
		setUserFiles(new Map([['review', [parsePackageFile(FILE).contents!]]]));
		const asked = await probed('review');
		expect(asked).toBe(false);
		expect((await tableOf('review')).macros.offen.map((a) => a.kind)).toEqual(['o', 'm']);
	});

	it('gives the parser the arguments of a bundled package without asking TeX', async () => {
		expect(await probed('marginnote')).toBe(false);
		expect((await tableOf('marginnote')).macros.marginnote.map((a) => a.kind)).toEqual(['o', 'm', 'o']);
	});

	it('gives the parser what TeX reports for a package Texpile has no file for', async () => {
		await probeInstalledPackages([{ name: 'zzlocal', options: '' }], '', async () => ({
			commands: [{ name: 'zznote', spec: 'o m', own: true }]
		}));
		expect((await tableOf('zzlocal')).macros.zznote.map((a) => a.kind)).toEqual(['o', 'm']);
	});

	it("keeps a package's arguments where the class defines the command differently", async () => {
		expect((await tableOf('class-revtex4-2', 'booktabs')).macros.toprule.map((a) => a.kind)).toEqual(['o']);
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
			{ name: 'hlnote', args: [{ kind: 'o' }, { kind: 'm' }] },
			{ name: 'pt', args: [{ kind: 's' }, { kind: 'm' }] }
		]);
		expect(contents!.envs).toEqual([{ name: 'todo', args: [{ kind: 'm' }] }]);
	});
});
