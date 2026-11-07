// Preferences › Toolchain's Install tinymist: one install at a time for the whole app, its progress
// and outcome sent to every window, since any of them may be showing the Toolchain tab
import { app, BrowserWindow, ipcMain, net } from 'electron';
import * as fs from 'node:fs';
import { managedTinymistPath, probeTinymist } from '../typstService';
import { installTinymist, removeTinymist, type TinymistInstallResult, type TinymistInstallStep } from '../tinymist/tinymistInstall';
import { linuxLibc, tinymistAssetFor, TINYMIST_VERSION } from '../tinymist/tinymistRelease';
import { whileTypstLspsStopped } from './typstIpc';

// progress is a bar, not a log: a 30MB download arrives in thousands of chunks
const PROGRESS_EVERY_MS = 100;
// the first run of a freshly downloaded program waits on the virus scanner (see probeTinymist)
const FIRST_RUN_TIMEOUT_MS = 60_000;

export type ManagedTinymistStatus = {
	/** the release Install fetches */
	pinned: string;
	/** tinymist publishes a build for this OS and CPU */
	supported: boolean;
	/** Texpile's copy when there is one; version null when it no longer runs */
	installed: { command: string; version: string | null; typstVersion: string | null } | null;
	/** the step an install under way has reached, for a window that opens mid-install */
	step: TinymistInstallStep | null;
};

let install: { done: Promise<TinymistInstallResult>; cancel: AbortController; step: TinymistInstallStep | null } | null = null;
// installs and removals take turns: two windows' clicks must not move the same file at once
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

// process.report is how Node tells glibc from musl; only Linux asks
function glibcVersion(): string | undefined {
	try {
		const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
		return report?.header?.glibcVersionRuntime;
	} catch {
		return undefined;
	}
}

function currentAsset() {
	return tinymistAssetFor(process.platform, process.arch, process.platform === 'linux' ? linuxLibc(glibcVersion()) : 'gnu');
}

async function status(): Promise<ManagedTinymistStatus> {
	const command = managedTinymistPath(app.getPath('userData'));
	const present = fs.existsSync(command);
	const version = present ? await probeTinymist(command) : null;
	return {
		pinned: TINYMIST_VERSION,
		supported: currentAsset() !== null,
		installed: present ? { command, version: version?.version ?? null, typstVersion: version?.typstVersion ?? null } : null,
		step: install?.step ?? null
	};
}

function swapManagedCopy<T>(change: () => Promise<T>): Promise<T> {
	return whileTypstLspsStopped(managedTinymistPath(app.getPath('userData')), change);
}

function startInstall(): Promise<TinymistInstallResult> {
	const cancel = new AbortController();
	let sentAt = 0;
	function onStep(step: TinymistInstallStep): void {
		const now = Date.now();
		const phaseChanged = running.step?.phase !== step.phase;
		running.step = step;
		if (!phaseChanged && now - sentAt < PROGRESS_EVERY_MS && step.received !== step.total) return;
		sentAt = now;
		broadcast('typst:tinymist:progress', step);
	}
	const done = inTurn(() =>
		installTinymist({
			userData: app.getPath('userData'),
			asset: currentAsset(),
			// Chromium's network stack, so the system proxy and certificate store apply as in the browser
			fetchArchive: (url, init) => net.fetch(url, { signal: init.signal, cache: 'no-store' }),
			signal: cancel.signal,
			onStep,
			probe: (command) => probeTinymist(command, FIRST_RUN_TIMEOUT_MS),
			swap: swapManagedCopy
		})
	).then((result) => {
		install = null;
		broadcast('typst:tinymist:finished', result);
		return result;
	});
	const running: NonNullable<typeof install> = { cancel, step: null, done };
	install = running;
	return done;
}

export function registerTinymistIpc(): void {
	ipcMain.handle('typst:tinymist:status', () => status());
	// a second click, from this window or another, joins the install under way
	ipcMain.handle('typst:tinymist:install', () => install?.done ?? startInstall());
	ipcMain.on('typst:tinymist:cancel', () => install?.cancel.abort());
	ipcMain.handle('typst:tinymist:remove', () =>
		inTurn(() => removeTinymist(app.getPath('userData'), swapManagedCopy)).then((result) => {
			broadcast('typst:tinymist:finished', result);
			return result;
		})
	);
}
