// the global snippet file and package folder, under userData so a portable copy keeps them beside the exe
import { app, shell } from 'electron';
import * as fs from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { handleFs } from './ipcResult';

const STARTER = `{
	"v": 1,
	"snippets": {
	}
}
`;

// one package file per package; more than this is not a folder of package files
const MAX_PACKAGE_FILES = 500;
const MAX_PACKAGE_BYTES = 2_000_000;

function globalPath(): string {
	return join(app.getPath('userData'), 'snippets.json');
}

/** name -> text of the <name>.json files in a folder; none when it is missing */
async function readPackageDir(dir: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
	for (const file of names.filter((n) => /^[\w.+-]+\.json$/i.test(n)).slice(0, MAX_PACKAGE_FILES)) {
		const path = join(dir, file);
		const stat = await fs.promises.stat(path).catch(() => null);
		if (!stat?.isFile() || stat.size > MAX_PACKAGE_BYTES) continue;
		const text = await fs.promises.readFile(path, 'utf8').catch(() => null);
		if (text !== null) out[file.replace(/\.json$/i, '')] = text;
	}
	return out;
}

export function registerSnippetsIpc(): void {
	handleFs('snippets:readGlobal', () => fs.promises.readFile(globalPath(), 'utf8').catch(() => null));
	// the package files: the global folder's, and a project's under .texpile/packages
	handleFs('snippets:readPackages', async (root: unknown) => ({
		global: await readPackageDir(join(app.getPath('userData'), 'packages')),
		project: typeof root === 'string' && isAbsolute(root) ? await readPackageDir(join(root, '.texpile', 'packages')) : {}
	}));
	// made on first use, so there is a file to open
	handleFs('snippets:revealGlobal', async () => {
		const path = globalPath();
		await fs.promises.writeFile(path, STARTER, { flag: 'wx' }).catch(() => {});
		shell.showItemInFolder(path);
		return path;
	});
}
