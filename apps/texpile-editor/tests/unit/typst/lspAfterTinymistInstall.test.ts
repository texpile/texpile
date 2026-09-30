// @vitest-environment jsdom
// Installing tinymist from Preferences must reach editors that are already open: a window whose
// server never started (no tinymist) tries again, and one already running is left alone.
import { it, expect, beforeAll } from 'vitest';
import { stopTypstClient, typstClient, typstServerGen } from '$lib/languages/typst/intellisense/lspClient';

let starts = 0;
let tinymistThere = false;
let finished: ((result: TinymistInstallResult) => void) | undefined;

beforeAll(() => {
	window.texpileTypst = {
		startLsp: async () => {
			starts++;
			return tinymistThere ? { ok: true } : { ok: false, error: 'tinymist was not found on PATH.' };
		},
		send: () => undefined,
		stopLsp: () => undefined,
		onMessage: () => () => undefined,
		onExit: () => () => undefined,
		onTinymistFinished: (cb: (result: TinymistInstallResult) => void) => {
			finished = cb;
			return () => undefined;
		}
	} as unknown as TexpileTypstBridge;
});

async function settled(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
}

it('retries a server that could not start once tinymist is installed', async () => {
	expect(await typstClient('/project')).toBeNull();
	// the same folder asks again: no second spawn attempt without something having changed
	expect(await typstClient('/project')).toBeNull();
	expect(starts).toBe(1);

	const gen = typstServerGen.current;
	tinymistThere = true;
	finished!({ ok: true, command: '/data/tinymist/tinymist', version: '0.15.8', typstVersion: '0.15.1' });
	await settled();
	expect(typstServerGen.current).toBe(gen + 1);
	expect(await typstClient('/project')).not.toBeNull();
	expect(starts).toBe(2);
});

it('leaves a running server alone', async () => {
	const gen = typstServerGen.current;
	finished!({ ok: true });
	await settled();
	expect(typstServerGen.current).toBe(gen);
	expect(await typstClient('/project')).not.toBeNull();
	expect(starts).toBe(2);
	stopTypstClient();
});

it('does nothing for an install that failed', async () => {
	tinymistThere = false;
	expect(await typstClient('/other')).toBeNull();
	const gen = typstServerGen.current;
	finished!({ ok: false, reason: 'offline', detail: 'fetch failed' });
	await settled();
	expect(typstServerGen.current).toBe(gen);
	stopTypstClient();
});
