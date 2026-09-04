import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { fileURLToPath } from 'node:url';

// The docs are markdown in ../docs, outside this project root, reached through import.meta.glob
// in content.server.ts. Vite only watches the files it has already loaded from there, and a
// change in a server-only module does not reload the browser on its own. Watch the folder and
// reload the page, so an edit, a new page or a deleted page shows up like any other dev change.
function docsReload(): Plugin {
	const slash = (p: string) => p.replace(/\\/g, '/');
	const dir = slash(fileURLToPath(new URL('../docs/', import.meta.url)));
	return {
		name: 'texpile-docs-reload',
		apply: 'serve',
		configureServer(server: ViteDevServer) {
			server.watcher.add(dir);
			server.watcher.on('all', (event, changed) => {
				const file = slash(changed);
				if (!file.startsWith(dir) || !file.endsWith('.md')) return;
				for (const env of Object.values(server.environments)) {
					for (const mod of env.moduleGraph.getModulesByFile(file) ?? []) env.moduleGraph.invalidateModule(mod);
				}
				server.hot.send({ type: 'full-reload', path: '*' });
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		docsReload()
	]
});
