// Engine bridge for the browser-mounted live harness: exposes the PRODUCT engine modules
// (draft-service compile, warm daemon typeset, synctex, file bytes) over plain HTTP so
// DraftView can run in ordinary Chromium with a window.texpileNative shim. No Electron.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const engineDir = path.join(repoRoot, 'electron/lua').replace(/\\/g, '/');
const dist = (m) => require(path.join(repoRoot, 'electron/dist', m));
const draftService = dist('draft-service.js');
const draftDaemon = dist('draft-daemon.js');
const fsService = dist('fs-service.js');

const PORT = Number(process.env.LIVE_BRIDGE_PORT || 8099);
const workBase = path.join(os.tmpdir(), 'texpile-live-harness');

const copyDir = (src, dst) => {
	fs.mkdirSync(dst, { recursive: true });
	for (const e of fs.readdirSync(src, { withFileTypes: true })) {
		const s = path.join(src, e.name);
		const d = path.join(dst, e.name);
		if (e.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
};

const json = (res, code, body) => {
	res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
	res.end(JSON.stringify(body));
};

http
	.createServer(async (req, res) => {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, {
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET,POST,OPTIONS',
				'access-control-allow-headers': 'content-type'
			});
			return res.end();
		}
		const url = new URL(req.url, `http://localhost:${PORT}`);
		try {
			if (req.method === 'GET' && url.pathname === '/file') {
				const p = url.searchParams.get('path');
				const { data, mime } = await fsService.fileBytes(p);
				res.writeHead(200, { 'content-type': mime, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
				return res.end(data);
			}
			if (req.method === 'GET' && url.pathname === '/src') {
				const root = url.searchParams.get('root');
				return json(res, 200, { content: fs.readFileSync(path.join(root, 'main.tex'), 'utf8') });
			}
			let body = {};
			if (req.method === 'POST') {
				const chunks = [];
				for await (const c of req) chunks.push(c);
				body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
			}
			switch (url.pathname) {
				case '/fixture': {
					// fresh copy per (name, run): edits accumulate inside one run, runs never collide
					const src = path.join(here, 'fixtures', body.name);
					const root = path.join(workBase, body.run || 'run', body.name);
					fs.rmSync(root, { recursive: true, force: true });
					copyDir(src, root);
					return json(res, 200, { root: root.replace(/\\/g, '/') });
				}
				case '/compile':
					return json(res, 200, await draftService.compileDraft({ root: body.root, mainFile: body.mainFile || 'main.tex', engineDir }));
				case '/typeset':
					return json(
						res,
						200,
						await draftDaemon.typesetParagraph({
							root: body.root,
							mainFile: body.mainFile || 'main.tex',
							engineDir,
							text: body.text,
							hsize: body.hsize
						})
					);
				case '/synctex':
					return json(res, 200, await fsService.synctex(body));
				case '/write':
					fs.writeFileSync(path.join(body.root, body.file || 'main.tex'), body.content);
					return json(res, 200, { ok: true });
				case '/stop':
					draftDaemon.stopDaemon();
					return json(res, 200, { ok: true });
				default:
					return json(res, 404, { error: 'unknown ' + url.pathname });
			}
		} catch (e) {
			return json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
		}
	})
	.listen(PORT, () => console.log(`live bridge on :${PORT}`));

process.on('SIGTERM', () => {
	draftDaemon.stopDaemon();
	process.exit(0);
});
