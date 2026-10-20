// the bundled package files as plain JSON under assets/data/, fetched when asked for, so the main thread and the
// workers share one copy (an import() is built once per worker build). The ids come as a virtual module
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const ID = 'virtual:bundled-package-ids';
// the indexes the knowledge module imports itself
const INDEXES = new Set(['texpile/catalog', 'keyed', 'package-for', 'base-table', 'env-facts', 'commands', 'registries']);

function bundledIds(dataDir: string): string[] {
	const ids: string[] = [];
	(function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(file);
			else if (entry.name.endsWith('.json')) ids.push(path.relative(dataDir, file).split(path.sep).join('/').slice(0, -5));
		}
	})(dataDir);
	return ids.filter((id) => !INDEXES.has(id)).sort();
}

/** the virtual id list, for the main build and the worker builds */
export function packageDataIds(dataDir: string): Plugin {
	return {
		name: 'package-data-ids',
		resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
		load(id) {
			if (id !== `\0${ID}`) return undefined;
			return `export default ${JSON.stringify(bundledIds(dataDir).join('\n'))}.split('\\n');`;
		}
	};
}

/** the files themselves, beside the chunks; the dev server reads them where they are */
export function packageData(dataDir: string): Plugin {
	return {
		...packageDataIds(dataDir),
		name: 'package-data',
		generateBundle() {
			for (const id of bundledIds(dataDir))
				this.emitFile({ type: 'asset', fileName: `assets/data/${id}.json`, source: fs.readFileSync(path.join(dataDir, `${id}.json`)) });
		}
	};
}
