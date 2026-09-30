// @vitest-environment jsdom
// The renderer's view of the one-click tinymist install: progress and outcome arrive from main
// for every window, and a success re-checks what the Toolchain tab shows.
import { it, expect, beforeEach } from 'vitest';
import { tinymistInstaller } from '../../../../src/lib/modals/window/tinymistInstall.svelte';
import { toolchainProbe } from '../../../../src/lib/modals/window/toolchainProbe.svelte';
import { tinymistFailureText, tinymistStepPercent, tinymistStepText } from '../../../../src/lib/modals/window/tinymistInstallText';

type Fake = {
	finish?: (result: TinymistInstallResult) => void;
	resolves: number;
	installed: ManagedTinymistStatus['installed'];
};

let fake: Fake;
// the installer subscribes once, as it would to the one bridge a window has
const broadcast: { progress?: (step: TinymistInstallStep) => void; finished?: (result: TinymistInstallResult) => void } = {};
const INSTALLED = { command: '/data/tinymist/tinymist', version: '0.15.8', typstVersion: '0.15.1' };

beforeEach(() => {
	fake = { resolves: 0, installed: null };
	window.texpileTypst = {
		tinymistStatus: async () => ({ pinned: '0.15.8', supported: true, installed: fake.installed, step: null }),
		// main broadcasts the outcome to every window, the asking one included, before it replies
		installTinymist: () =>
			new Promise<TinymistInstallResult>((resolve) => {
				fake.finish = (result) => {
					broadcast.finished?.(result);
					resolve(result);
				};
			}),
		cancelTinymistInstall: () => fake.finish?.({ ok: false, reason: 'cancelled', detail: 'cancelled' }),
		onTinymistProgress: (cb: (step: TinymistInstallStep) => void) => {
			broadcast.progress = cb;
			return () => undefined;
		},
		onTinymistFinished: (cb: (result: TinymistInstallResult) => void) => {
			broadcast.finished = cb;
			return () => undefined;
		},
		resolve: async () => {
			fake.resolves++;
			return null;
		},
		probeToolchain: async () => [],
		distros: async () => []
	} as unknown as TexpileTypstBridge;
});

it('shows the progress main reports, then what is installed', async () => {
	await tinymistInstaller.refresh();
	expect(tinymistInstaller.offered).toBe(true);
	const done = tinymistInstaller.install();
	expect(tinymistInstaller.busy).toBe(true);
	broadcast.progress!({ phase: 'download', received: 1048576, total: 4194304 });
	expect(tinymistInstaller.step).toEqual({ phase: 'download', received: 1048576, total: 4194304 });
	fake.installed = INSTALLED;
	fake.finish!({ ok: true, ...INSTALLED });
	expect(await done).toMatchObject({ ok: true });
	expect(tinymistInstaller.step).toBeNull();
	expect(tinymistInstaller.failure).toBeNull();
	await new Promise((r) => setTimeout(r, 0));
	expect(tinymistInstaller.status?.installed).toEqual(INSTALLED);
});

it('keeps a failure to explain, and forgets it on the next attempt', async () => {
	const first = tinymistInstaller.install();
	fake.finish!({ ok: false, reason: 'checksum', detail: 'expected a, got b' });
	await first;
	expect(tinymistInstaller.failure).toMatchObject({ reason: 'checksum' });
	const second = tinymistInstaller.install();
	expect(tinymistInstaller.failure).toBeNull();
	tinymistInstaller.cancel();
	await second;
	// Cancel is the reader's own doing, not something to explain back
	expect(tinymistInstaller.failure).toBeNull();
	expect(tinymistInstaller.step).toBeNull();
});

it('re-checks the toolchain after an install, when the Toolchain tab has been looked at', async () => {
	await toolchainProbe.run();
	const before = fake.resolves;
	const done = tinymistInstaller.install();
	fake.finish!({ ok: true, ...INSTALLED });
	await done;
	await new Promise((r) => setTimeout(r, 0));
	expect(fake.resolves).toBe(before + 1);
});

it('re-checks the toolchain when an install ends while a probe is still running', async () => {
	// latexindent can take seconds, long after tinymist was found missing
	window.texpileTypst!.probeToolchain = () => new Promise(() => undefined);
	void toolchainProbe.run();
	await new Promise((r) => setTimeout(r, 0));
	const before = fake.resolves;
	const done = tinymistInstaller.install();
	fake.finish!({ ok: true, ...INSTALLED });
	await done;
	await new Promise((r) => setTimeout(r, 0));
	expect(fake.resolves).toBe(before + 1);
});

it('words each step and each failure', () => {
	expect(tinymistStepText({ phase: 'download', received: 1048576, total: 3145728 }, '0.15.8')).toBe(
		'Downloading tinymist 0.15.8: 1.0 of 3.0 MB'
	);
	expect(tinymistStepText({ phase: 'download', received: 0, total: 0 }, '0.15.8')).toBe('Downloading tinymist 0.15.8');
	expect(tinymistStepPercent({ phase: 'download', received: 1, total: 4 })).toBe(25);
	expect(tinymistStepPercent({ phase: 'extract', received: 0, total: 0 })).toBe(100);
	expect(tinymistFailureText({ reason: 'offline', detail: 'net::ERR_INTERNET_DISCONNECTED' })).toMatch(/Could not reach dl\.texpile\.com/);
	expect(tinymistFailureText({ reason: 'checksum', detail: '' })).toMatch(/does not match the checksum/);
	expect(tinymistFailureText({ reason: 'disk', detail: 'ENOSPC: no space left on device' })).toMatch(/ENOSPC/);
});
