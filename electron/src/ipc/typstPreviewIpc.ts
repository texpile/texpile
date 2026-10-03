// The Typst live preview's page hosting and the host-side guest relay.
//
// The renderer starts the preview through the language server; here we fetch the page tinymist
// serves for it, prepare it (see typstPreviewPage.ts) and re-serve it, which the pane then frames.
//
// Why re-serve instead of framing tinymist's origin directly: served by us, we can theme the page
// and open a postMessage bridge to it.
// Served over LOOPBACK HTTP, not from a custom scheme, and that is forced on us rather than chosen.
// tinymist's data plane validates the Origin header of every websocket handshake (its own
// tool/preview/http.rs, guarding a localhost server against other pages on the machine). It accepts
// its own origin, `vscode-webview://…`, and anything on `http://127.0.0.1` or `http://localhost`.
// A page served from a custom scheme sends `typstpreview://…`, gets rejected, and the socket closes
// with 1006 - so the ONE way to serve a modified copy of their page and still let it connect is to
// serve it from a loopback http origin.
//
// Note this also rules out our own renderer connecting directly in a packaged build, where the
// origin would be `app://bundle`.
// per-page CSP because host and guest pages differ in exactly one right: the host's page needs
// its socket to tinymist, while a guest's page - html that arrived OVER THE WIRE from the host -
// gets no network at all, so a hostile host cannot use a guest's screen to probe its loopback.
import { ipcMain, type WebContents } from 'electron';
import * as typstPreviewPage from '../typstPreviewPage';
import * as previewRelay from '../typstPreviewRelay';

const preparedPages = new Map<number, { html: string; csp: string }>();
const pageHooked = new Set<number>();
let pageServer: import('node:http').Server | null = null;
let pageServerPort = 0;

// the page needs its inlined wasm and a socket to tinymist, and nothing else
const HOST_PAGE_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline' 'wasm-unsafe-eval' data:",
	"style-src 'unsafe-inline'",
	'img-src data: blob:',
	'font-src data:',
	'connect-src ws://127.0.0.1:* http://127.0.0.1:* data: blob:',
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'"
].join('; ');
// a guest's page talks to its parent frame by postMessage only; no connect-src at all beyond
// the data:/blob: its renderer wasm reaches for
const GUEST_PAGE_CSP = HOST_PAGE_CSP.replace('connect-src ws://127.0.0.1:* http://127.0.0.1:* data: blob:', 'connect-src data: blob:');

async function ensurePageServer(): Promise<number> {
	if (pageServer && pageServerPort) return pageServerPort;
	const http = await import('node:http');
	return new Promise<number>((resolve, reject) => {
		const server = http.createServer((req, res) => {
			const id = Number((req.url ?? '').replace(/^\/+/, '').split('?')[0]);
			const page = preparedPages.get(id);
			if (!page) {
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('No preview prepared');
				return;
			}
			res.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store',
				'Content-Security-Policy': page.csp
			});
			res.end(page.html);
		});
		server.on('error', reject);
		// 127.0.0.1 explicitly, never 0.0.0.0: this must not be reachable from the network
		server.listen(0, '127.0.0.1', () => {
			pageServer = server;
			pageServerPort = (server.address() as import('node:net').AddressInfo).port;
			resolve(pageServerPort);
		});
	});
}

/**
 * Colours reach us from the renderer's theme; this bounds them to a colour-shaped charset so they
 * cannot break out of the style rule they are interpolated into (no quotes, braces, semicolons).
 *
 * Deliberately a charset, NOT an allowlist of colour functions: this used to accept only hex/rgb,
 * and when the theme turned out to declare oklch(...) it silently substituted WHITE - which painted
 * the preview's surround and its page edges invisible. A colour space this function has not heard
 * of must still pass.
 */
function cssColour(v: unknown): string {
	const s = String(v ?? '').trim();
	return s.length <= 100 && /^[a-zA-Z#][a-zA-Z0-9#(),.%/\s-]*$/.test(s) ? s : '#ffffff';
}

// once per window, its id read now: a destroyed webContents can no longer be asked for it
function forgetPageOnClose(sender: WebContents): void {
	const wcId = sender.id;
	if (pageHooked.has(wcId)) return;
	pageHooked.add(wcId);
	sender.once('destroyed', () => {
		pageHooked.delete(wcId);
		preparedPages.delete(wcId);
	});
}

export function registerTypstPreviewIpc(): void {
	ipcMain.handle('typst:preview:prepare', async (e, body: { host: string; background: string; foreground: string }) => {
		// only ever tinymist's loopback preview server, never an address from anywhere else
		if (!/^127\.0\.0\.1:\d+$/.test(body?.host ?? '')) return { ok: false, error: 'refusing a non-loopback preview host' };
		try {
			const res = await fetch(`http://${body.host}/`, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) return { ok: false, error: `preview server answered ${res.status}` };
			const page = typstPreviewPage.preparePreviewPage(await res.text(), {
				dataPlaneHost: body.host,
				background: cssColour(body.background),
				foreground: cssColour(body.foreground)
			});
			preparedPages.set(e.sender.id, { html: page, csp: HOST_PAGE_CSP });
			forgetPageOnClose(e.sender);
			const port = await ensurePageServer();
			// one page per window, so the id keeps windows from seeing each other's preview
			return { ok: true, url: `http://127.0.0.1:${port}/${e.sender.id}` };
		} catch (err) {
			return { ok: false, error: String(err instanceof Error ? err.message : err) };
		}
	});

	ipcMain.on('typst:preview:release', (e) => preparedPages.delete(e.sender.id));

	// the raw page as tinymist serves it, for a HOST to ship to its guests (each guest themes it
	// with its own colours at prepare time, so the raw copy is what travels)
	ipcMain.handle('typst:preview:pageHtml', async (_e, body: { host: string }) => {
		if (!/^127\.0\.0\.1:\d+$/.test(body?.host ?? '')) return { ok: false, error: 'refusing a non-loopback preview host' };
		try {
			const res = await fetch(`http://${body.host}/`, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) return { ok: false, error: `preview server answered ${res.status}` };
			return { ok: true, html: await res.text() };
		} catch (err) {
			return { ok: false, error: String(err instanceof Error ? err.message : err) };
		}
	});

	// a GUEST serving the host-shipped page for its own frame. Same loopback server, but under the
	// no-network CSP: this html crossed the session, so it renders and posts to its parent - nothing else.
	ipcMain.handle('typst:preview:prepareGuest', async (e, body: { html: string; background: string; foreground: string }) => {
		// ~1.6MB is the page's natural size; 16MB bounds what a hostile host can park in this map
		if (typeof body?.html !== 'string' || body.html.length > 16 * 1024 * 1024) return { ok: false, error: 'refusing an oversized page' };
		try {
			const page = typstPreviewPage.prepareGuestPreviewPage(body.html, {
				background: cssColour(body.background),
				foreground: cssColour(body.foreground)
			});
			preparedPages.set(e.sender.id, { html: page, csp: GUEST_PAGE_CSP });
			forgetPageOnClose(e.sender);
			const port = await ensurePageServer();
			return { ok: true, url: `http://127.0.0.1:${port}/${e.sender.id}` };
		} catch (err) {
			return { ok: false, error: String(err instanceof Error ? err.message : err) };
		}
	});

	// preview relay (host side of a shared session): one websocket per guest to the preview task's
	// data plane; see typstPreviewRelay.ts.
	ipcMain.on('typst:relay:open', (e, body: { id: number; host: string }) => {
		if (typeof body?.id === 'number' && typeof body?.host === 'string') previewRelay.open(e.sender, body.id, body.host);
	});
	ipcMain.on('typst:relay:send', (e, body: { id: number; data: string | ArrayBuffer }) => {
		if (typeof body?.id === 'number' && (typeof body.data === 'string' || body.data instanceof ArrayBuffer))
			previewRelay.send(e.sender, body.id, body.data);
	});
	ipcMain.on('typst:relay:close', (e, body: { id: number }) => {
		if (typeof body?.id === 'number') previewRelay.close(e.sender, body.id);
	});
}
