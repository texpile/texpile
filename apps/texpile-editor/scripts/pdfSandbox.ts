// pdf.js's QuickJS sandbox, which runs a PDF's own JavaScript, at pdfjs-sandbox/ beside the bundle: pdf.sandbox.mjs
// imports quickjs-eval.js by that fixed name, and it fetches quickjs-eval.wasm from beside itself
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';
import { PDF_SANDBOX_DIR } from '../src/lib/pdf-view/pdf-viewer/pdfSandboxDir';

const FILES: Record<string, string> = { 'quickjs-eval.js': 'text/javascript', 'quickjs-eval.wasm': 'application/wasm' };

export function pdfSandbox(appDir: string): Plugin {
	const wasmDir = path.join(path.dirname(createRequire(path.join(appDir, 'package.json')).resolve('pdfjs-dist/package.json')), 'wasm');
	return {
		name: 'pdf-sandbox',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const name = req.url?.split('?')[0].slice(`/${PDF_SANDBOX_DIR}/`.length);
				if (!req.url?.startsWith(`/${PDF_SANDBOX_DIR}/`) || !name || !FILES[name]) return next();
				res.setHeader('Content-Type', FILES[name]);
				res.end(fs.readFileSync(path.join(wasmDir, name)));
			});
		},
		generateBundle() {
			for (const name of Object.keys(FILES)) {
				this.emitFile({ type: 'asset', fileName: `${PDF_SANDBOX_DIR}/${name}`, source: fs.readFileSync(path.join(wasmDir, name)) });
			}
		}
	};
}
