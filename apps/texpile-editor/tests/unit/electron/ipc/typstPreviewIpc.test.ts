// A window's prepared preview page is served on loopback until the window goes. Electron is stood in for, including a
// webContents that refuses to be read once it is destroyed; the page server is the real one
import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

type Handler = (e: { sender: unknown }, ...args: unknown[]) => unknown;

const h = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));

vi.mock('electron', () => ({
	ipcMain: {
		handle: (channel: string, fn: Handler) => h.handlers.set(channel, fn),
		on: (channel: string, fn: Handler) => h.handlers.set(channel, fn)
	}
}));

const { registerTypstPreviewIpc } = await import('../../../../../../electron/src/ipc/typstPreviewIpc');
registerTypstPreviewIpc();

function window(id: number) {
	let destroyed = false;
	const wc = new EventEmitter() as EventEmitter & { id: number; destroy(): void };
	Object.defineProperty(wc, 'id', {
		get: () => {
			if (destroyed) throw new TypeError('Object has been destroyed');
			return id;
		}
	});
	wc.destroy = () => {
		destroyed = true;
		wc.emit('destroyed');
	};
	return wc;
}

const PAGE = '<html><body><script>new URL("/", window.location.href)</script></body></html>';

it("serves a closed window's page no longer, however often the window prepared it", async () => {
	const wc = window(9);
	const prepare = () =>
		h.handlers.get('typst:preview:prepareGuest')!({ sender: wc }, { html: PAGE, background: '#fff', foreground: '#000' });
	const { url } = (await prepare()) as { url: string };
	await prepare();
	expect(wc.listenerCount('destroyed')).toBe(1);
	expect((await fetch(url)).status).toBe(200);
	wc.destroy();
	expect((await fetch(url)).status).toBe(404);
});
