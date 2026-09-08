// In-app update state over the window.texpileUpdates bridge (electron/src/updates.ts).
// One store drives the modal, the Help-menu badge, and the background-download toasts.
import { browser } from '$lib/runtime';
import { box } from '$lib/runes/box.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { route } from '$lib/router.svelte';
import { m } from '$lib/paraglide/messages';

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
export type CheckStatus = 'update' | 'none' | 'error' | 'unsupported';

export type UpdateState = {
	phase: UpdatePhase;
	version: string | null;
	notes?: string[];
	percent: number;
	transferred: number;
	total: number;
	/** 'package-manager' = linux deb/rpm/pacman: full download, then a system password prompt.
	 *  'portable' = the Windows zip: nothing to install over, the modal offers the download page. */
	installMode: 'restart' | 'package-manager' | 'portable';
	error: string | null;
};

const IDLE: UpdateState = { phase: 'idle', version: null, percent: 0, transferred: 0, total: 0, installMode: 'restart', error: null };

export const updateState = box<UpdateState>({ ...IDLE });
export const updateModalOpen = box(false);

type CheckResult =
	| { status: 'update'; version: string; notes: string | null; installMode: 'restart' | 'package-manager' | 'portable' }
	| { status: 'none' }
	| { status: 'error'; message: string }
	| { status: 'unsupported' };

type UpdatesBridge = {
	check: (manual?: boolean) => Promise<CheckResult>;
	download: () => Promise<{ ok: boolean }>;
	install: () => Promise<void>;
	onProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => () => void;
	onDownloaded: (cb: (update: { version: string }) => void) => () => void;
	onError: (cb: (err: { message: string }) => void) => () => void;
};

function bridge(): UpdatesBridge | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileUpdates?: UpdatesBridge }).texpileUpdates;
}

function splitNotes(notes: string | null): string[] | undefined {
	if (!notes) return undefined;
	const lines = notes
		.split(/\r?\n/)
		.map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
		.filter(Boolean)
		.slice(0, 10);
	return lines.length ? lines : undefined;
}

// with the modal hidden, the workspace has the Help menu (badge + toast); the start screen has
// no menu bar, so reopening the modal is the only reachable surface there
function surfaceInBackground(kind: 'downloaded' | 'error', version: string | null, message?: string): void {
	if (updateModalOpen.current) return;
	if (route.path !== '/workspace') {
		updateModalOpen.current = true;
		return;
	}
	if (kind === 'downloaded') {
		toaster.success({
			title: m.updates_toast_ready_title(),
			description: m.updates_toast_ready_description({ version: version ?? '' })
		});
	} else {
		toaster.error({
			title: m.updates_toast_failed_title(),
			description: message || m.updates_toast_failed_description()
		});
	}
}

let wired = false;
function wireEvents(b: UpdatesBridge): void {
	if (wired) return;
	wired = true;
	b.onProgress((p) => {
		updateState.current = { ...updateState.current, phase: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total };
	});
	b.onDownloaded(({ version }) => {
		updateState.current = { ...updateState.current, phase: 'downloaded', version };
		surfaceInBackground('downloaded', version);
	});
	b.onError(({ message }) => {
		updateState.current = { ...updateState.current, phase: 'error', error: message };
		surfaceInBackground('error', null, message);
	});
}

/** query the feed; on 'update' the store is filled and the modal is ready to open. */
export async function checkForUpdate(manual = false): Promise<CheckStatus> {
	const b = bridge();
	if (!b) return 'unsupported';
	const res = await b.check(manual).catch((e): CheckResult => ({ status: 'error', message: String(e) }));
	if (res.status !== 'update') return res.status;
	wireEvents(b);
	updateState.current = { ...IDLE, phase: 'available', version: res.version, notes: splitNotes(res.notes), installMode: res.installMode };
	return 'update';
}

export async function startDownload(): Promise<void> {
	const b = bridge();
	if (!b) return;
	wireEvents(b);
	updateState.current = { ...updateState.current, phase: 'downloading', percent: 0, transferred: 0, total: 0, error: null };
	// completion/failure arrive via onDownloaded/onError; the invoke rejection carries the same error
	await b.download().catch(() => {});
}

export function installNow(): void {
	void bridge()?.install();
}
