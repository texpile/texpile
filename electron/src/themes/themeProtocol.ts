// texpile-theme://themes/<path>: the fonts and images a custom theme loads by relative url(), from the themes folder only
import { protocol, type CustomScheme } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { themesDir } from './themesIpc';

// standard, so a relative url() in the theme resolves against the folder
export const THEME_SCHEME: CustomScheme = {
	scheme: 'texpile-theme',
	privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
};

const THEME_MIME: Record<string, string> = {
	'.css': 'text/css',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml'
};

function inside(p: string, root: string): boolean {
	return p.startsWith(root + path.sep);
}

export function registerThemeProtocol(): void {
	protocol.handle(THEME_SCHEME.scheme, async (request) => {
		// the page is another origin (app://bundle, or the vite server in dev), and fonts load in CORS mode
		const cors = { 'Access-Control-Allow-Origin': '*' };
		const url = new URL(request.url);
		const root = await fs.promises.realpath(themesDir()).catch(() => null);
		if (!root || url.host !== 'themes') return new Response('Not found', { status: 404, headers: cors });
		const file = path.join(root, path.normalize(decodeURIComponent(url.pathname)));
		// realpath both sides: a symlink inside the folder must not reach out of it
		const real = await fs.promises.realpath(file).catch(() => null);
		if (!inside(file, root) || (real && !inside(real, root))) return new Response('Forbidden', { status: 403, headers: cors });
		const mime = THEME_MIME[path.extname(file).toLowerCase()];
		const st = real ? await fs.promises.stat(real).catch(() => null) : null;
		if (!real || !st?.isFile() || !mime) return new Response('Not found', { status: 404, headers: cors });
		const body = await fs.promises.readFile(real);
		return new Response(new Uint8Array(body), {
			headers: { ...cors, 'Content-Type': mime, 'Content-Length': String(st.size), 'Cache-Control': 'no-cache' }
		});
	});
}
