import { afterEach, describe, expect, it } from 'vitest';
import { macroOptions } from '$lib/languages/latex/intellisense/completion/macros';
import { parsePackageFile, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';
import { packageFileFrom } from '$lib/languages/latex/packageFileDraft';
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
});

async function tableOf(...names: string[]) {
	return packageTableOf(
		await loadedPackages(
			names.map((name) => ({ name, options: [] })),
			true
		)
	);
}

describe('package files', () => {
	it('names every dropped entry, a list that is no list included', () => {
		const { dropped } = parsePackageFile('{ "version": 1, "macros": [5, null, "x"], "envs": [{ "name": 5 }], "deps": "oops" }');
		expect(dropped).toEqual(['deps', 'macros[0]', 'macros[1]', 'macros[2]', 'envs[0]']);
	});

	it('completes the commands only where the package is loaded', async () => {
		const { contents, dropped } = parsePackageFile(FILE);
		expect(dropped).toEqual(['notarealentry', 'macros[2]']);
		setUserFiles(new Map([['review', [contents!]]]));
		const labels = async (text: string) => (await macroOptions(text)).map((o) => o.label);
		expect(await labels('\\usepackage{review}\n')).toContain('\\offen');
		expect(await labels('\\usepackage{other}\n')).not.toContain('\\offen');
	});

	it('reports a dependency whose engines it does not know', () => {
		const { contents, dropped } = parsePackageFile(
			'{ "version": 1, "deps": [{ "id": "packages/fontspec", "engines": ["luatex"] }, { "id": "packages/xcolor", "engines": ["lualatex"] }] }'
		);
		expect(dropped).toEqual(['packages/fontspec']);
		expect(contents?.deps).toEqual([{ id: 'packages/xcolor', engines: ['lualatex'] }]);
	});

	it('leaves out an entry whose fields are not the format, which completion would choke on', () => {
		const { contents, dropped } = parsePackageFile(
			JSON.stringify({
				version: 1,
				macros: [
					{ name: 'good', doc: 'fine' },
					{ name: 'numdoc', doc: 5 },
					{ name: 'objprints', prints: { a: 1 } },
					{ name: 'weird space' },
					{ name: 'badin', in: 'bogus' },
					{ name: 'badkind', args: [{ kind: 'zz' }] }
				],
				envs: [{ name: 'box', in: 'text' }]
			})
		);
		expect(contents?.macros?.map((e) => e.name)).toEqual(['good']);
		expect(dropped).toEqual(['numdoc', 'objprints', 'weird space', 'badin', 'badkind', 'box']);
	});

	it('turns away a file in the old format', () => {
		const { contents, problem } = parsePackageFile(
			'{ "macros": [{ "name": "offen", "arg": { "format": "{}", "snippet": "offen{${1}}" } }] }'
		);
		expect(contents).toBeNull();
		expect(problem).toMatch(/old package file format/);
	});

	it('gives the parser the arguments the file names', async () => {
		setUserFiles(new Map([['review', [parsePackageFile(FILE).contents!]]]));
		expect((await tableOf('review')).macros.offen.map((a) => a.kind)).toEqual(['o', 'm']);
	});

	it('gives the parser the arguments of a bundled package', async () => {
		expect((await tableOf('marginnote')).macros.marginnote.map((a) => a.kind)).toEqual(['o', 'm', 'o']);
	});

	it('gives the parser nothing for a package with no data and no file', async () => {
		expect((await tableOf('zzlocal')).macros.zznote).toBeUndefined();
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
				{ name: 'tikzset', spec: 'm' },
				{ name: '__labtools_note:n', spec: 'm', own: true }
			]
		};
		const { contents, problem, dropped } = parsePackageFile(JSON.stringify(packageFileFrom(probe)));
		expect(problem).toBeNull();
		expect(dropped).toEqual([]);
		expect(contents!.macros).toEqual([
			{ name: 'celsius' },
			{ name: 'hlnote', args: [{ kind: 'o' }, { kind: 'm' }] },
			{ name: 'pt', args: [{ kind: 's' }, { kind: 'm' }] }
		]);
		expect(contents!.envs).toEqual([{ name: 'todo', args: [{ kind: 'm' }] }]);
	});
});
