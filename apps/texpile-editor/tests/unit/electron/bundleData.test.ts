import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DATA_PACK, DATA_PACK_INDEX, packData } from '../../../scripts/packageData';
import { packedDataFile } from '../../../../../electron/src/bundleData';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-pack-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it('serves each package file out of the pack the build writes, byte for byte', async () => {
	const data = path.join(dir, 'data');
	const root = path.join(dir, 'bundle');
	const files: Record<string, string> = {
		'packages/amsmath': '{"macros":[{"name":"text"}]}',
		'classes/article': '{"macros":[]}',
		'libraries/tikzlibrary/arrows': '{"note":"é and ü"}'
	};
	for (const [id, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(data, `${id}.json`)), { recursive: true });
		fs.writeFileSync(path.join(data, `${id}.json`), text);
	}
	const { pack, index } = packData(data, Object.keys(files));
	fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
	fs.writeFileSync(path.join(root, DATA_PACK), pack);
	fs.writeFileSync(path.join(root, DATA_PACK_INDEX), JSON.stringify(index));

	for (const [id, text] of Object.entries(files))
		expect(new TextDecoder().decode((await packedDataFile(root, `/assets/data/${id}.json`))!)).toBe(text);
	expect(await packedDataFile(root, '/assets/data/packages/nope.json')).toBeNull();
	expect(await packedDataFile(root, '/assets/data/constructor.json')).toBeNull();
	expect(await packedDataFile(root, '/assets/index-abc12345.js')).toBeUndefined();
});
