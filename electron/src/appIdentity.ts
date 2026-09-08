// Which Texpile this process is (packaged vs dev, release vs dev channel), the data dirs that
// identity pins, and where the shipped resources live.
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const isDev = !app.isPackaged;

// A dev-channel build (productName ending in "Dev", made with --config.productName="Texpile Dev")
// gets its OWN settings dir and instance lock, so a test exe runs beside the installed Texpile
// without touching its settings or fighting its single-instance lock.
export const devChannel = /[ -]dev$/.test(app.getName().toLowerCase());

// the Windows zip is its own build (pnpm dist:portable) and carries this flag in its package.json
// through electron-builder's extraMetadata. A build-time stamp, never a guess from the folder the
// exe sits in: 1.0.1 guessed from the missing uninstaller, got it wrong for every installed copy,
// and started them all with fresh settings
export const portable = app.isPackaged && packagedFlag('portable');

function packagedFlag(name: string): boolean {
	try {
		return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))[name] === true;
	} catch {
		return false;
	}
}

/**
 * Must run before anything reads app.getPath('userData') and before whenReady.
 *
 * The display name feeds menus/notifications and the Linux WM_CLASS (GNOME matches it against the
 * .desktop file's StartupWMClass=Texpile; without this the dock shows "Texpile-desktop").
 * package.json's `name` also names the settings dir on every existing install, so the paths are
 * pinned BEFORE the rename can move them.
 */
export function applyAppIdentity(): void {
	const dataDirName = devChannel ? 'texpile-desktop-dev' : 'texpile-desktop';
	app.setPath('userData', path.join(app.getPath('appData'), dataDirName));
	app.setPath('sessionData', path.join(app.getPath('appData'), dataDirName));
	app.setName(devChannel ? 'Texpile Dev' : 'Texpile');

	// a portable copy keeps settings, caches and the instance lock beside the exe, so the folder can
	// move and it runs beside an installed Texpile; a read-only folder keeps the dirs above
	if (portable) {
		const dir = path.join(path.dirname(process.execPath), 'data');
		try {
			fs.mkdirSync(dir, { recursive: true });
			fs.accessSync(dir, fs.constants.W_OK);
			app.setPath('userData', dir);
			app.setPath('sessionData', dir);
		} catch {
			/* read-only folder */
		}
	}

	// dev/test hook: userData scopes settings, caches, and the single-instance lock,
	// so without this a dev run can't start while an installed Texpile is open
	if (isDev && process.env.TEXPILE_USER_DATA) {
		app.setPath('userData', process.env.TEXPILE_USER_DATA);
		app.setPath('sessionData', process.env.TEXPILE_USER_DATA);
	}
}

export function bundleDir(): string {
	return path.join(process.resourcesPath, 'app-dist');
}

// Draft-mode engine .lua files. Shipped outside the asar via extraResources (see
// electron-builder.yml). In dev, __dirname is electron/dist, so the repo's electron/lua
// is one level up.
export function luaDir(): string {
	return isDev ? path.join(__dirname, '..', 'lua') : path.join(process.resourcesPath, 'lua');
}
