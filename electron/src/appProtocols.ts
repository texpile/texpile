// The two custom schemes: app:// serves the packaged renderer bundle (with its CSP), and
// texfile:// serves workspace files (images, PDFs) confined to the claimed roots.
import { protocol } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { MIME } from './fs/fsService';
import { isAllowedFontPath } from './fontT1Map';
import { bundleDir } from './appIdentity';
import { windowRoots, normRoot } from './windows/windowRegistry';

// a `standard` scheme enforces strict MIME checks on module scripts and worker imports,
// so text/javascript must be exact
const BUNDLE_MIME: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.wasm': 'application/wasm',
	'.map': 'application/json',
	'.txt': 'text/plain',
	'.pdf': 'application/pdf',
	'.wav': 'audio/wav'
};

// CSP for the packaged renderer (dev loads from the vite server, which this doesn't touch). The
// strict script-src is the real backstop: even if untrusted collab content were ever injected into
// the renderer, it can't execute, so it can never reach the texfile:// read primitive. img-src omits
// remote hosts, which also kills any CSS url() beacon. connect-src stays broad for now (auto-update
// over https + the user-configurable collab relay over ws/wss); pin it to specific hosts as a follow-up.
const RENDERER_CSP = [
	"default-src 'none'",
	"script-src 'self' 'wasm-unsafe-eval'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' texfile: blob: data:",
	"font-src 'self' data:",
	"connect-src 'self' texfile: blob: data: https: wss: ws:",
	"worker-src 'self' blob:",
	"child-src 'self' blob:",
	"media-src 'self' blob: data:",
	"object-src 'none'",
	"base-uri 'self'",
	// The Typst preview page, which we serve ourselves on loopback (see typst:preview:prepare). It
	// has to be an http://127.0.0.1 origin rather than a custom scheme, because tinymist's data
	// plane rejects websocket handshakes from any other origin. Still a separate origin from
	// app://bundle, so the framed page cannot reach this window's bridges.
	'frame-src http://127.0.0.1:*',
	"frame-ancestors 'none'",
	"form-action 'self'"
].join('; ');

/**
 * Must run before app.whenReady(). `standard` gives real origin semantics (module workers
 * need this), `supportFetchAPI` lets pdf.js fetch, `stream` avoids buffering whole PDFs.
 *
 * texfile:// also needs `corsEnabled`, because it is always a DIFFERENT ORIGIN from the page that
 * fetches it - app://bundle when packaged, the vite server in dev. Older Chromium let the
 * handler's Access-Control-Allow-Origin stand on its own; from Chromium 150 (Electron 43) a
 * scheme that has not opted into CORS has its response headers ignored and the fetch rejects
 * outright, which is the "Failed to fetch" the PDF pane shows in place of the document.
 */
export function registerPrivilegedSchemes(): void {
	protocol.registerSchemesAsPrivileged([
		// codeCache: without it V8 recompiles the whole renderer bundle on every launch
		{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
		{ scheme: 'texfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
	]);
}

// stream a file (or a byte slice of it) as a fetch Response body without buffering it all.
// node's web ReadableStream type and the DOM lib's don't unify, but the runtime object does.
function fileStream(file: string, range?: { start: number; end: number }): ReadableStream {
	return Readable.toWeb(fs.createReadStream(file, range)) as unknown as ReadableStream;
}

// protocol.handle can't see which window sent the request, so the confinement is the union of
// live claimed roots. realpath both sides: a symlink inside the root must not escape it.
async function insideClaimedRoot(p: string): Promise<boolean> {
	let real: string;
	try {
		real = await fs.promises.realpath(p);
	} catch {
		return false; // missing file: the handler would 404 anyway
	}
	const n = normRoot(real);
	for (const r of windowRoots.values()) {
		if (!r) continue;
		try {
			// a lone file's window reads beside it too: the images its document shows
			const rn = normRoot(await fs.promises.realpath(r.file ? path.dirname(r.raw) : r.raw));
			if (n === rn || n.startsWith(rn + path.sep)) return true;
		} catch {
			/* root vanished (unmounted drive): claim is dead, keep looking */
		}
	}
	return false;
}

export function registerProtocolHandlers(): void {
	protocol.handle('app', async (request) => {
		const url = new URL(request.url);
		let rel = decodeURIComponent(url.pathname);
		if (rel === '/' || rel === '') rel = '/index.html';
		const root = bundleDir();
		const file = path.normalize(path.join(root, rel));
		// path traversal guard: resolved file must stay inside the bundle
		if (!file.startsWith(root + path.sep) && file !== root) {
			return new Response('Forbidden', { status: 403 });
		}
		try {
			const st = await fs.promises.stat(file);
			if (!st.isFile()) return new Response('Not found', { status: 404 });
			const mime = BUNDLE_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
			const headers: Record<string, string> = { 'Content-Type': mime, 'Content-Length': String(st.size) };
			// vite content-hashes everything under assets/ (name-XXXXXXXX.ext), so those bytes can
			// never change under their URL: cache forever. index.html & co keep stable names and
			// must revalidate on every load.
			if (rel.includes('/assets/') && /-[\w-]{8,}\.[a-z0-9]+$/i.test(rel)) {
				headers['Cache-Control'] = 'public, max-age=31536000, immutable';
			} else {
				headers['Cache-Control'] = 'no-cache';
				headers['Last-Modified'] = st.mtime.toUTCString();
			}
			// CSP is a document-level directive; attach it to the served HTML (ignored on subresources)
			if (mime === 'text/html') headers['Content-Security-Policy'] = RENDERER_CSP;
			// big files (wasm, fonts) stream; small ones stay buffered, one readFile is cheaper
			if (st.size > 1_000_000) return new Response(fileStream(file), { headers });
			const data = await fs.promises.readFile(file);
			return new Response(new Uint8Array(data), { headers });
		} catch {
			return new Response('Not found', { status: 404 });
		}
	});

	protocol.handle('texfile', async (request) => {
		const url = new URL(request.url);
		const p = url.searchParams.get('path');
		if (!p) return new Response('Missing path', { status: 400 });
		// texfile:// is a different origin than app://bundle, so pdf.js's fetch needs CORS
		const cors = { 'Access-Control-Allow-Origin': '*' };
		// every request must land inside a claimed workspace root (VS Code's localResourceRoots):
		// nothing renderer-reachable may turn texfile:// into an arbitrary-file read primitive.
		// Exception: the exact font paths the compile pipeline attached to draft font records
		// (TeX trees, system fonts) -- outside every root, and the live preview draws nothing
		// without them.
		if (!(await insideClaimedRoot(p)) && !isAllowedFontPath(p)) return new Response('Forbidden', { status: 403, headers: cors });
		try {
			const st = await fs.promises.stat(p);
			if (!st.isFile()) return new Response('Not found', { status: 404, headers: cors });
			const mime = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
			const etag = `"${st.mtimeMs}-${st.size}"`;
			const base: Record<string, string> = {
				...cors,
				'Content-Type': mime,
				'Cache-Control': 'no-cache',
				'Accept-Ranges': 'bytes',
				ETag: etag,
				'Last-Modified': st.mtime.toUTCString()
			};
			// no-cache means "revalidate": a matching ETag turns a reload into a 304 with no body
			if (request.headers.get('if-none-match') === etag) {
				return new Response(null, { status: 304, headers: base });
			}
			// pdf.js fetches PDFs in ranged chunks; end is inclusive, `bytes=start-` means to EOF
			const m = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');
			if (m) {
				const start = Number(m[1]);
				const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
				if (start >= st.size || start > end) {
					return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${st.size}` } });
				}
				return new Response(fileStream(p, { start, end }), {
					status: 206,
					headers: {
						...base,
						'Content-Length': String(end - start + 1),
						'Content-Range': `bytes ${start}-${end}/${st.size}`
					}
				});
			}
			return new Response(fileStream(p), { headers: { ...base, 'Content-Length': String(st.size) } });
		} catch {
			return new Response('Not found', { status: 404, headers: cors });
		}
	});
}
