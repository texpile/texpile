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

// one file for thousands: Windows scans each file an installer writes, and macOS seals each one in the signature.
// app:// answers assets/data/<id>.json out of it (electron/src/bundleData.ts)
export const DATA_PACK = 'assets/data.pack';
export const DATA_PACK_INDEX = 'assets/data.pack.json';

export type DataPackIndex = Record<string, [offset: number, length: number]>;

export function packData(dataDir: string, ids: string[]): { pack: Buffer; index: DataPackIndex } {
	const parts: Buffer[] = [];
	const index: DataPackIndex = {};
	let offset = 0;
	for (const id of ids) {
		const bytes = fs.readFileSync(path.join(dataDir, `${id}.json`));
		index[id] = [offset, bytes.length];
		parts.push(bytes);
		offset += bytes.length;
	}
	return { pack: Buffer.concat(parts), index };
}

/** the files themselves beside the chunks: packed for the app, one by one for the web guest, whose host serves
 *  plain files; the dev server reads them where they are */
export function packageData(dataDir: string, packed: boolean): Plugin {
	return {
		...packageDataIds(dataDir),
		name: 'package-data',
		generateBundle() {
			const ids = bundledIds(dataDir);
			if (!packed) {
				for (const id of ids)
					this.emitFile({ type: 'asset', fileName: `assets/data/${id}.json`, source: fs.readFileSync(path.join(dataDir, `${id}.json`)) });
				return;
			}
			const { pack, index } = packData(dataDir, ids);
			this.emitFile({ type: 'asset', fileName: DATA_PACK, source: pack });
			this.emitFile({ type: 'asset', fileName: DATA_PACK_INDEX, source: JSON.stringify(index) });
		}
	};
}
