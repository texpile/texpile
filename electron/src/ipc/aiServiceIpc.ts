// The custom service's key, which a window can set but never read, and a picture turned into LaTeX or Typst by the AI
// service picked in Preferences
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { askAi } from '../ai/askAi';
import { serviceKeyKept, setServiceKey } from '../ai/service/serviceKey';

const IMAGE_TIMEOUT_MS = 180_000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// about 20 MB of base64, past what any of the services takes
const MOST_IMAGE_CHARS = 28_000_000;

const running = new Map<string, AbortController>();

type ImageRequest = { id?: unknown; system?: unknown; request?: unknown; mediaType?: unknown; base64?: unknown };

export function registerAiServiceIpc(): void {
	ipcMain.handle('ai:serviceKey', () => serviceKeyKept());

	ipcMain.handle('ai:setServiceKey', (_e, key: unknown) => {
		if (typeof key === 'string') setServiceKey(key.trim());
		return serviceKeyKept();
	});

	ipcMain.handle('ai:imageToLatex', async (e, req: ImageRequest) => {
		const { id, system, request, mediaType, base64 } = req ?? {};
		if (typeof id !== 'string' || typeof system !== 'string' || typeof request !== 'string') return { ok: false, error: 'bad request' };
		if (!IMAGE_TYPES.includes(mediaType as string) || typeof base64 !== 'string' || base64.length > MOST_IMAGE_CHARS)
			return { ok: false, error: 'bad image' };
		const abort = new AbortController();
		running.set(id, abort);
		function stop(): void {
			abort.abort();
		}
		e.sender.once('destroyed', stop);
		try {
			const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
			return await askAi('image', readSettings(), { system, request, images: [{ mediaType: mediaType as string, base64 }] }, signal);
		} finally {
			running.delete(id);
			e.sender.removeListener('destroyed', stop);
		}
	});

	ipcMain.on('ai:cancel', (_e, id: unknown) => {
		if (typeof id === 'string') running.get(id)?.abort();
	});
}
