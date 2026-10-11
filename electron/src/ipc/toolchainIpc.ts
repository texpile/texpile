import { app, ipcMain } from 'electron';
import * as fs from 'node:fs';
import { readSettings } from '../appSettings';
import { portable } from '../appIdentity';
import { dirForms } from '../shell/toolDirs';
import { detectDistros } from '../shell/distros';
import * as toolchain from '../toolchain';
import { kpsewhich } from '../shell/kpsewhich';

const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

export function registerToolchainIpc(): void {
	// tinymist is not in this list: typst:resolve answers for it, with more detail
	ipcMain.handle('toolchain:probe', (e) =>
		toolchain.probeToolchain((p) => {
			if (!e.sender.isDestroyed()) e.sender.send('toolchain:probe:result', p);
		})
	);
	ipcMain.handle('toolchain:distros', () => detectDistros(readSettings().toolDirs, app.getPath('userData')));
	// a .bib the TeX installation has (IEEEabrv.bib), for the reference checks; a bare name only
	ipcMain.handle('toolchain:texBib', async (_e, name: unknown) => {
		if (typeof name !== 'string' || !/^[\w.+-]+\.bib$/i.test(name)) return null;
		const found = await kpsewhich(name);
		return found ? fs.promises.readFile(found, 'utf8').catch(() => null) : null;
	});
	// a package's .sty, read for the parser's argument signatures
	ipcMain.handle('toolchain:texPackage', async (_e, name: unknown) => {
		if (typeof name !== 'string' || !/^[\w.+-]+\.sty$/i.test(name)) return null;
		const found = await kpsewhich(name);
		if (!found) return null;
		const size = await fs.promises.stat(found).then(
			(s) => s.size,
			() => Infinity
		);
		// a generated .sty can run to megabytes
		return size <= MAX_PACKAGE_BYTES ? fs.promises.readFile(found, 'utf8').catch(() => null) : null;
	});
	ipcMain.handle('toolchain:dirForms', (_e, entry: unknown) => {
		// an AppImage on a stick is as portable as the Windows zip; its launcher says so in the environment
		const f = dirForms(typeof entry === 'string' ? entry : '.', portable || !!process.env.APPIMAGE);
		let exists = false;
		// the folder behind any symlink (MacTeX's texbin, a linked home), which is how distros names it
		let real = f.absolute;
		try {
			exists = fs.statSync(f.absolute).isDirectory();
			real = fs.realpathSync.native(f.absolute);
		} catch {
			/* not there, or not readable: exists stays false */
		}
		return { ...f, exists, real };
	});
}
