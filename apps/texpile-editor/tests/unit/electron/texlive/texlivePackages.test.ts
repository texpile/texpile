import { describe, expect, it } from 'vitest';
import { installPackageFor, missingTexFile, type TlmgrRun } from '../../../../../../electron/src/texlive/texlivePackages';

const FINAL = 'https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2026/tlnet-final';

// `tlmgr search --global --file /chemfig.sty` as TeX Live prints it, with a doc file and latex-dev's copy beside it
const SEARCH = [
	'tlmgr: package repository https://mirrors.example/tlnet (verified)',
	'chemfig-doc-de:',
	'\ttexmf-dist/doc/latex/chemfig-doc-de/chemfig.sty',
	'latex-dev-extra:',
	'\ttexmf-dist/tex/latex-dev/chemfig/chemfig.sty',
	'chemfig:',
	'\ttexmf-dist/tex/generic/chemfig/chemfig.sty',
	'\ttexmf-dist/tex/latex/chemfig/chemfig.sty'
].join('\n');

function fakeTlmgr(answer: (args: string[]) => { code: number; out: string }): { run: TlmgrRun; calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		run: async (args) => {
			calls.push(args.join(' '));
			return answer(args);
		}
	};
}

describe('installPackageFor', () => {
	it('installs the package whose TeX files hold the file a document loads', async () => {
		const log = "(./main.tex\n! LaTeX Error: File `chemfig.sty' not found.\n";
		const t = fakeTlmgr((args) => (args[0] === 'search' ? { code: 0, out: SEARCH } : { code: 0, out: '' }));
		expect(await installPackageFor(missingTexFile(log)!, t.run, FINAL)).toEqual({ ok: true, package: 'chemfig' });
		expect(t.calls).toEqual(['search --global --file /chemfig.sty', 'install chemfig']);
	});

	it("moves to the year's final repository once the next release takes over", async () => {
		let final = false;
		const t = fakeTlmgr((args) => {
			if (args[0] === 'option') final = true;
			if (!final) return { code: 1, out: 'Local TeX Live (2026) is older than remote repository (2027).' };
			return args[0] === 'search' ? { code: 0, out: SEARCH } : { code: 0, out: '' };
		});
		expect(await installPackageFor('chemfig.sty', t.run, FINAL)).toMatchObject({ ok: true });
		expect(t.calls.slice(0, 3)).toEqual([
			'search --global --file /chemfig.sty',
			`option repository ${FINAL}`,
			'search --global --file /chemfig.sty'
		]);
	});

	it('says offline when the package list cannot be fetched', async () => {
		const t = fakeTlmgr(() => ({ code: 1, out: 'tlmgr: TLPDB::from_file could not get texlive.tlpdb from: https://mirror.ctan.org/x' }));
		expect(await installPackageFor('chemfig.sty', t.run, FINAL)).toMatchObject({ ok: false, reason: 'offline' });
	});
});
