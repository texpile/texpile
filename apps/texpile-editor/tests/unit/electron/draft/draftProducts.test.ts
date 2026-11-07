import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readPage } from '../../../../../../electron/src/draft/draftProducts';
import { isPreviewFile } from '../../../../../../electron/src/draft/previewFiles';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-page-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// an mwe example image lives in the TeX tree: the preview fetched it through texfile://, which refused it
it('lets the preview load an image the engine read from outside the folder', async () => {
	const outside = path.join(os.tmpdir(), 'texmf', 'example-image-a.pdf').replace(/\\/g, '/');
	fs.writeFileSync(path.join(dir, 'page-001.jsonl'), JSON.stringify({ t: 'image', file: outside, x: 0, y: 0, w: 10, h: 10 }) + '\n');
	const page = await readPage(dir, path.join(dir, 'project'), 1, 100, 100);
	expect(page.records).toContain(outside);
	expect(isPreviewFile(outside)).toBe(true);
});
