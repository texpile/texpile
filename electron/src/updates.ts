// In-app updates via electron-updater. The feed (latest*.yml) is updates.texpile.com, which also
// counts the check; binaries/blockmaps come from dl.texpile.com per the urls rewritten into the
// ymls at release time. Nothing downloads without an explicit renderer call (autoDownload off).
// autoInstallOnAppQuit is set at download start, not later: BaseUpdater registers its quit hook
// and MacUpdater hands the zip to Squirrel exactly once, at download completion, and both skip it
// when the flag is off at that moment. So the download click is the install-at-quit consent.
import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { autoUpdater } from 'electron-updater';

export type CheckResult =
	| {
			status: 'update';
			version: string;
			/** latest*.yml releaseNotes (one note per line) or null. */
			notes: string | null;
			/** 'package-manager' = linux deb/rpm/pacman: full download + a pkexec password prompt. */
			installMode: 'restart' | 'package-manager';
	  }
	| { status: 'none' }
	| { status: 'error'; message: string }
	| { status: 'unsupported' };

// electron-builder stamps resources/package-type for deb/rpm/pacman installs; the updater
// factory routes on the same file
function installMode(): 'restart' | 'package-manager' {
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
// the downloaded installer path, for the package-manager install path below
let downloadedFile: string | null = null;

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
	autoUpdater.on('update-downloaded', (info) => {
		op = null;
		downloadedFile = info.downloadedFile ?? null;
		send('update:downloaded', { version: info.version });
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
		// electron-updater attaches x-user-staging-id (a persistent random uuid) We dont need this and we dont track it
		'x-user-staging-id': '',
		...(manual ? { 'x-texpile-check': 'manual' } : {})
	};
	try {
		const res = await autoUpdater.checkForUpdates();
		// isUpdateAvailable is the library's own semver compare (prerelease-safe) + staged-rollout
		// + minimum-system-version gate; a hand-rolled numeric compare here broke prereleases
		if (!res || !res.isUpdateAvailable || !res.updateInfo) return { status: 'none' };
		const info = res.updateInfo;
		// a just-tagged release may still get pulled for a bad build: automatic checks sit out the first 3 hours, and manual checks are allowed to override that
		const age = Date.now() - Date.parse(info.releaseDate ?? '');
		if (!manual && Number.isFinite(age) && age < 3 * 60 * 60 * 1000) return { status: 'none' };
		return {
			status: 'update',
			version: info.version,
			notes: typeof info.releaseNotes === 'string' && info.releaseNotes.trim() ? info.releaseNotes : null,
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

	//There seem to be some upstream bug with electron updater (which is delibeartively not sync). This results in tthe app freeze after clicking update. The following is a patch
	if (installMode() === 'package-manager' && downloadedFile) {
		const quoted = downloadedFile.replace(/"/g, '\\"');
		const child = spawn('pkexec', ['/bin/bash', '-c', `dpkg -i "${quoted}" || apt-get install -f -y`], { stdio: 'ignore' });
		child.on('error', (err) => {
			op = null;
			send('update:error', { message: err instanceof Error ? err.message : String(err) });
		});
		child.on('close', (code) => {
			if (code === 0) {
				app.relaunch();
				app.quit();
			} else {
				// 126/127 = the password prompt was dismissed; anything else is a real dpkg failure
				op = null;
				send('update:error', { message: `installer exited with code ${code}` });
			}
		});
		return;
	}
	// silent install + relaunch on windows; mac ignores the flags
	autoUpdater.quitAndInstall(true, true);
}
