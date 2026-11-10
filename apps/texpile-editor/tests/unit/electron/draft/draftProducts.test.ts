import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promote, publishView, readPage } from '../../../../../../electron/src/draft/draftProducts';
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

function passFolders(name: string): { out: string; engine: string; read: (f: string) => string } {
	const out = path.join(dir, name, '_draft');
	const engine = path.join(out, 'p1');
	fs.mkdirSync(engine, { recursive: true });
	for (const f of ['draft.pdf', 'draft.synctex.gz', 'draft.log']) fs.writeFileSync(path.join(out, f), `landed ${f}`);
	return { out, engine, read: (f) => fs.readFileSync(path.join(out, f), 'utf8') };
}

const readBack = { byTex: ['aux'], byTools: ['bbl'] };

// an agent's half written file failed the compile, and a double-click then jumped by the failed pass's synctex
it('keeps the landed PDF and synctex through a pass that shipped no pages', () => {
	const { out, engine, read } = passFolders('failed');
	for (const f of ['draft.pdf', 'draft.synctex.gz', 'draft.log']) fs.writeFileSync(path.join(engine, f), `failed ${f}`);
	promote(engine, out, path.join(dir, 'failed'), readBack);
	expect(read('draft.pdf')).toBe('landed draft.pdf');
	expect(read('draft.synctex.gz')).toBe('landed draft.synctex.gz');
	expect(read('draft.log')).toBe('failed draft.log');
});

it('publishes the last pass whole, synctex included', () => {
	const { out, engine, read } = passFolders('landed');
	fs.writeFileSync(path.join(engine, 'draft.pdf'), 'new pdf');
	promote(engine, out, path.join(dir, 'landed'), readBack);
	publishView(out);
	expect(read('draft.pdf')).toBe('new pdf');
	expect(fs.existsSync(path.join(out, 'draft.synctex.gz'))).toBe(false);
});
