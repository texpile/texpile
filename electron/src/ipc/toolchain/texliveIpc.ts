// Preferences › Toolchain's Install TeX Live: one install at a time for the whole app, its progress and outcome sent to
// every window, as for tinymist (tinymistIpc.ts)
import { BrowserWindow, ipcMain, net } from 'electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { stopPool } from '../../draft/teleport/enginePool';
import { stopTeleports } from '../../draft/teleport/teleportService';
import { stopDrawing } from '../../draw/drawDaemon';
import { shellEnvReady } from '../../shell/shellEnv';
import { setPathFallback } from '../../shell/toolDirs';
import { firstInformativeLine } from '../../toolchain';
import { managedTexLiveAsset, managedTexLiveBin, managedTexLiveRoot, texInUseIsManaged } from '../../texlive/managedTexLive';
import { installTexLive, removeTexLive, type TexLiveInstallResult, type TexLiveInstallStep } from '../../texlive/texliveInstall';
import { installPackageFor, isPackageFile, type PackageInstall } from '../../texlive/texlivePackages';
import { TEXLIVE_FINAL_REPOSITORY, TEXLIVE_VERSION, TEXLIVE_YEAR } from '../../texlive/texliveRelease';
import { runTlmgr } from '../../texlive/tlmgr';

// progress is a bar, not a log: a 300MB download arrives in tens of thousands of chunks
const PROGRESS_EVERY_MS = 100;
// the first run of a freshly unpacked program waits on the virus scanner
const FIRST_RUN_TIMEOUT_MS = 60_000;

export type ManagedTexLiveStatus = {
	/** the build Install fetches */
	pinned: string;
	year: number;
	/** the download's size; null when Texpile has no build for this machine */
	megabytes: number | null;
	/** Texpile's tree when there is one; detail null when it no longer runs */
	installed: { bin: string; detail: string | null } | null;
	/** the step an install under way has reached, for a window that opens mid-install */
	step: TexLiveInstallStep | null;
};

let install: { done: Promise<TexLiveInstallResult>; cancel: AbortController; step: TexLiveInstallStep | null } | null = null;
// installs and removals take turns: two windows' clicks must not move the same tree at once
let queue: Promise<unknown> = Promise.resolve();

function inTurn<T>(op: () => Promise<T>): Promise<T> {
	const next = queue.then(op, op);
	queue = next.catch(() => undefined);
	return next;
}

function broadcast(channel: string, payload: unknown): void {
	for (const w of BrowserWindow.getAllWindows()) {
		if (!w.isDestroyed()) w.webContents.send(channel, payload);
	}
}

function versionLine(lualatex: string, timeout = 10_000): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(lualatex, ['--version'], { timeout, windowsHide: true }, (err, stdout) =>
			resolve(err ? null : (firstInformativeLine(String(stdout)) ?? null))
		);
	});
}

async function status(): Promise<ManagedTexLiveStatus> {
	const bin = managedTexLiveBin();
	const exe = process.platform === 'win32' ? '.exe' : '';
	return {
		pinned: TEXLIVE_VERSION,
		year: TEXLIVE_YEAR,
		megabytes: managedTexLiveAsset()?.megabytes ?? null,
		installed: bin ? { bin, detail: await versionLine(path.join(bin, `lualatex${exe}`)) } : null,
		step: install?.step ?? null
	};
}

// Windows holds a running program's folder open, and live mode and figures keep their engines warm
async function swapTree<T>(change: () => Promise<T>): Promise<T> {
	if (fs.existsSync(managedTexLiveRoot())) {
		stopTeleports();
		stopDrawing();
	}
	const result = await change();
	setPathFallback(managedTexLiveBin());
	return result;
}

function startInstall(): Promise<TexLiveInstallResult> {
	const cancel = new AbortController();
	let sentAt = 0;
	function onStep(step: TexLiveInstallStep): void {
		const now = Date.now();
		const phaseChanged = running.step?.phase !== step.phase;
		running.step = step;
		if (!phaseChanged && now - sentAt < PROGRESS_EVERY_MS && step.received !== step.total) return;
		sentAt = now;
		broadcast('toolchain:texlive:progress', step);
	}
	const done = inTurn(() =>
		installTexLive({
			root: managedTexLiveRoot(),
			asset: managedTexLiveAsset(),
			// Chromium's network stack, so the system proxy and certificate store apply as in the browser
			fetchArchive: (url, init) => net.fetch(url, { signal: init.signal, cache: 'no-store' }),
			signal: cancel.signal,
			onStep,
			probe: (lualatex) => versionLine(lualatex, FIRST_RUN_TIMEOUT_MS),
			swap: swapTree
		})
	).then((result) => {
		install = null;
		broadcast('toolchain:texlive:finished', result);
		return result;
	});
	const running: NonNullable<typeof install> = { cancel, step: null, done };
	install = running;
	return done;
}

// only Texpile's own tree: a TeX the writer installed is theirs to change
async function installFor(
	file: unknown,
	root: unknown,
	said?: (line: string) => void
): Promise<PackageInstall | { ok: false; reason: 'not-managed'; detail: string }> {
	if (typeof file !== 'string' || !isPackageFile(file)) return { ok: false, reason: 'unknown', detail: String(file) };
	await shellEnvReady();
	const bin = managedTexLiveBin();
	if (!bin || !texInUseIsManaged()) return { ok: false, reason: 'not-managed', detail: file };
	const result = await inTurn(() => installPackageFor(file, (args) => runTlmgr(bin, args, said), TEXLIVE_FINAL_REPOSITORY));
	// a warm spare read the file list before the install
	if (result.ok && typeof root === 'string') stopPool(root);
	return result;
}

export function registerTexLiveIpc(): void {
	ipcMain.handle('toolchain:texlive:status', () => status());
	// a second click, from this window or another, joins the install under way
	ipcMain.handle('toolchain:texlive:install', () => install?.done ?? startInstall());
	ipcMain.on('toolchain:texlive:cancel', () => install?.cancel.abort());
	// what tlmgr prints goes to the preview that waits on the install, with the compile's own lines
	ipcMain.handle('toolchain:texlive:installFor', (e, file: unknown, root: unknown) =>
		installFor(file, root, (line) => {
			if (typeof root === 'string' && !e.sender.isDestroyed()) e.sender.send('draft:progress', { root, notes: [line.slice(0, 160)] });
		})
	);
	ipcMain.handle('toolchain:texlive:inUse', async () => {
		await shellEnvReady();
		return texInUseIsManaged();
	});
	ipcMain.handle('toolchain:texlive:remove', () =>
		inTurn(() => removeTexLive(managedTexLiveRoot(), swapTree)).then((result) => {
			broadcast('toolchain:texlive:finished', result);
			return result;
		})
	);
}
