// the bundled package data, which the build packs into one file (apps/texpile-editor/scripts/packageData.ts)
import * as fs from 'node:fs';
import * as path from 'node:path';

const DATA_FILE = /^\/assets\/data\/(.+)\.json$/;
const PACK = 'assets/data.pack';
const PACK_INDEX = 'assets/data.pack.json';

type PackIndex = Record<string, [offset: number, length: number]>;

const indexes = new Map<string, Promise<PackIndex | null>>();

function indexIn(root: string): Promise<PackIndex | null> {
	let index = indexes.get(root);
	if (!index) {
		index = fs.promises
			.readFile(path.join(root, PACK_INDEX), 'utf8')
			.then((text) => JSON.parse(text) as PackIndex)
			.catch(() => null);
		indexes.set(root, index);
	}
	return index;
}

/** undefined for a path outside assets/data/, null for a file the pack does not hold */
export async function packedDataFile(root: string, rel: string): Promise<Uint8Array<ArrayBuffer> | null | undefined> {
	const id = DATA_FILE.exec(rel)?.[1];
	if (id === undefined) return undefined;
	const index = await indexIn(root);
	if (!index || !Object.hasOwn(index, id)) return null;
	const [offset, length] = index[id];
	const file = await fs.promises.open(path.join(root, PACK), 'r');
	try {
		const bytes = new Uint8Array(length);
		await file.read(bytes, 0, length, offset);
		return bytes;
	} finally {
		await file.close();
	}
}
