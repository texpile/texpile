// the global snippet file and package folder, under userData so a portable copy keeps them beside the exe
import { app, BrowserWindow } from 'electron';
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

function packagesDir(): string {
	return join(app.getPath('userData'), 'packages');
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

let changedTimer: NodeJS.Timeout | null = null;

function announceChange(): void {
	if (changedTimer) clearTimeout(changedTimer);
	changedTimer = setTimeout(() => {
		for (const w of BrowserWindow.getAllWindows()) w.webContents.send('snippets:globalChanged');
	}, 200);
}

// the files are edited in a Texpile tab or anywhere else, and neither is under a workspace's watch
function watchGlobalFiles(): void {
	let packagesWatch: fs.FSWatcher | null = null;
	function watchPackages(): void {
		packagesWatch?.close();
		packagesWatch = null;
		try {
			packagesWatch = fs.watch(packagesDir(), announceChange);
		} catch {
			// no folder yet: the watch on userData sees it made
		}
	}
	watchPackages();
	try {
		fs.watch(app.getPath('userData'), (_event, name) => {
			if (name === 'snippets.json') announceChange();
			else if (name === 'packages') {
				watchPackages();
				announceChange();
			}
		});
	} catch {
		// an unwatchable data folder: the files are read again when a window takes focus
	}
}

export function registerSnippetsIpc(): void {
	handleFs('snippets:readGlobal', () => fs.promises.readFile(globalPath(), 'utf8').catch(() => null));
	// the package files: the global folder's, and a project's under .texpile/packages
	handleFs('snippets:readPackages', async (root: unknown) => ({
		global: await readPackageDir(packagesDir()),
		project: typeof root === 'string' && isAbsolute(root) ? await readPackageDir(join(root, '.texpile', 'packages')) : {}
	}));
	handleFs('snippets:locations', async () => ({ snippets: globalPath(), packages: packagesDir() }));
	// made on first use, so there is a file to open
	handleFs('snippets:ensureGlobal', async () => {
		const path = globalPath();
		await fs.promises.writeFile(path, STARTER, { flag: 'wx' }).catch(() => {});
		return path;
	});
	watchGlobalFiles();
}
