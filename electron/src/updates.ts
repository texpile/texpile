// In-app updates via electron-updater. The feed (latest*.yml) is updates.texpile.com, which also
// counts the check; binaries/blockmaps come from dl.texpile.com per the urls rewritten into the
// ymls at release time. Nothing downloads without an explicit renderer call (autoDownload off).
// autoInstallOnAppQuit is set at download start, not later: BaseUpdater registers its quit hook
// and MacUpdater hands the zip to Squirrel exactly once, at download completion, and both skip it
// when the flag is off at that moment. So the download click is the install-at-quit consent.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { portable } from './appIdentity';

export type CheckResult =
	| {
			status: 'update';
			version: string;
			/** latest*.yml releaseNotes (one note per line) or null. */
			notes: string | null;
			/** 'package-manager' = linux deb/rpm/pacman: full download + a pkexec password prompt.
			 *  'portable' = the Windows zip: nothing to install over, the modal offers the download page. */
			installMode: 'restart' | 'package-manager' | 'portable';
	  }
	| { status: 'none' }
	| { status: 'error'; message: string }
	| { status: 'unsupported' };

// electron-builder stamps resources/package-type for deb/rpm/pacman installs; the updater
// factory routes on the same file
function installMode(): 'restart' | 'package-manager' | 'portable' {
	if (portable) return 'portable';
	if (process.platform !== 'linux') return 'restart';
	try {
		const t = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
		return t === 'deb' || t === 'rpm' || t === 'pacman' ? 'package-manager' : 'restart';
	} catch {
		return 'restart';
	}
}

// the user-initiated operation in flight; errors outside one are check failures, which are
// returned as a status instead of emitted
let op: 'download' | 'install' | null = null;
let wired = false;

// broadcast, not a pinned webContents: on macOS the window can close and be recreated
// mid-download, and a stale target would strand the completion event
function send(channel: string, payload: unknown): void {
	for (const w of BrowserWindow.getAllWindows()) {
		if (!w.isDestroyed()) w.webContents.send(channel, payload);
	}
}

function wire(): void {
	if (wired) return;
	wired = true;
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.on('download-progress', (p) => {
		send('update:progress', { percent: p.percent, transferred: p.transferred, total: p.total });
	});
	autoUpdater.on('update-downloaded', (downloaded) => {
		op = null;
		send('update:downloaded', { version: downloaded.version });
	});
	autoUpdater.on('error', (err) => {
		if (!op) return;
		op = null;
		send('update:error', { message: err instanceof Error ? err.message : String(err) });
	});
}

export async function check(manual: boolean): Promise<CheckResult> {
	if (!app.isPackaged) return { status: 'unsupported' };
	wire();
	autoUpdater.requestHeaders = {
		'x-texpile-version': app.getVersion(),
		...(manual ? { 'x-texpile-check': 'manual' } : {})
	};
	try {
		const res = await autoUpdater.checkForUpdates();
		if (!res || !res.isUpdateAvailable || !res.updateInfo) return { status: 'none' };
		const found = res.updateInfo;
		return {
			status: 'update',
			version: found.version,
			notes: typeof found.releaseNotes === 'string' && found.releaseNotes.trim() ? found.releaseNotes : null,
			installMode: installMode()
		};
	} catch (err) {
		return { status: 'error', message: err instanceof Error ? err.message : String(err) };
	}
}

export async function download(): Promise<void> {
	wire();
	op = 'download';
	autoUpdater.autoInstallOnAppQuit = true;
	try {
		await autoUpdater.downloadUpdate();
	} catch (err) {
		// the 'error' event usually fires too; `op` gates the renderer to one notification
		if (op === 'download') {
			op = null;
			send('update:error', { message: err instanceof Error ? err.message : String(err) });
		}
		throw err;
	}
}

export function install(): void {
	// a failed install emits 'error' instead of quitting; `op` lets it through to the renderer
	op = 'install';
	// Every platform goes through electron-updater, deb included. We used to spawn pkexec + dpkg
	// ourselves on deb (see e4a996f) because the library installs it with spawnSync and the window
	// sits in the WM's not-responding overlay for the whole password prompt. That trade turned out
	// worse in practice, so the freeze is back and the hand-rolled install is gone.
	// silent install + relaunch on windows; mac and linux ignore the flags
	autoUpdater.quitAndInstall(true, true);
}
