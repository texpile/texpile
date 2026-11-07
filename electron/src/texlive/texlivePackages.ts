// a file a document loads that Texpile's TeX Live lacks: TeX Live's own tlmgr finds the package holding it and installs it
export type TlmgrRun = (args: string[]) => Promise<{ code: number; out: string }>;

export type PackageInstall = { ok: true; package: string } | { ok: false; reason: 'offline' | 'unknown' | 'failed'; detail: string };

// what LaTeX loads by name from a package; a missing .tex is usually the writer's own
const PACKAGE_FILE = /^[\w.+-]+\.(sty|cls|clo|cfg|def|fd|ldf|bbx|cbx|lbx|dbx)$/;

const OFFLINE = /could not get texlive\.tlpdb|could not resolve host|network is unreachable|unable to (download|resolve)/i;
// the year's repository moved on to the next release
const RELEASE_OVER = /is older than remote repository/;
const SELF_UPDATE = /tlmgr itself needs to be updated/;

export function isPackageFile(file: string): boolean {
	return PACKAGE_FILE.test(file);
}

/** the file a `File ... not found` error names, when a TeX Live package could hold it */
export function missingTexFile(log: string): string | null {
	const file = /^! LaTeX Error: File `([^']+)' not found\./m.exec(log)?.[1];
	return file && isPackageFile(file) ? file : null;
}

/** the packages holding `file` among TeX's own files, from `tlmgr search --global --file`; latex-dev's copies last */
export function packagesHolding(out: string, file: string): string[] {
	const found: { pkg: string; dev: boolean }[] = [];
	let pkg: string | null = null;
	for (const line of out.split(/\r?\n/)) {
		if (/^[\w.+-]+:$/.test(line)) pkg = line.slice(0, -1);
		else if (pkg && /^\s/.test(line)) {
			const p = line.trim();
			if (p.startsWith('texmf-dist/tex/') && p.endsWith(`/${file}`) && !found.some((f) => f.pkg === pkg))
				found.push({ pkg, dev: p.includes('/latex-dev/') });
		}
	}
	return [...found.filter((f) => !f.dev), ...found.filter((f) => f.dev)].map((f) => f.pkg);
}

export async function installPackageFor(file: string, tlmgr: TlmgrRun, finalRepository: string): Promise<PackageInstall> {
	async function run(args: string[]): Promise<{ code: number; out: string }> {
		let r = await tlmgr(args);
		if (RELEASE_OVER.test(r.out)) {
			await tlmgr(['option', 'repository', finalRepository]);
			r = await tlmgr(args);
		}
		if (SELF_UPDATE.test(r.out)) {
			await tlmgr(['update', '--self']);
			r = await tlmgr(args);
		}
		return r;
	}
	const search = await run(['search', '--global', '--file', `/${file}`]);
	if (search.code !== 0) return failed(search.out);
	const pkg = packagesHolding(search.out, file)[0];
	if (!pkg) return { ok: false, reason: 'unknown', detail: file };
	const done = await run(['install', pkg]);
	if (done.code !== 0) return failed(done.out);
	return { ok: true, package: pkg };
}

function failed(out: string): PackageInstall {
	const said = out
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	return {
		ok: false,
		reason: OFFLINE.test(out) ? 'offline' : 'failed',
		detail: said.find((l) => /^tlmgr:|error/i.test(l)) ?? said.at(-1) ?? ''
	};
}
