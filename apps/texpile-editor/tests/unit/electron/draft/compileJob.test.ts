import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mirrorSourceFolders } from '../../../../../../electron/src/draft/compileJob';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-compilejob-')));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('gives every folder of .tex files its twin under _draft, so \\include can write its .aux', () => {
	fs.mkdirSync(path.join(root, 'chapters', 'appendix'), { recursive: true });
	fs.mkdirSync(path.join(root, 'figures'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(path.join(root, 'chapters', 'intro.tex'), '');
	fs.writeFileSync(path.join(root, 'chapters', 'appendix', 'a.tex'), '');
	fs.writeFileSync(path.join(root, 'figures', 'plot.png'), '');
	fs.writeFileSync(path.join(root, '.git', 'x.tex'), '');
	const out = path.join(root, '_draft');
	fs.mkdirSync(out);
	mirrorSourceFolders(root, out);
	expect(fs.existsSync(path.join(out, 'chapters', 'appendix'))).toBe(true);
	expect(fs.existsSync(path.join(out, 'figures'))).toBe(false);
	expect(fs.existsSync(path.join(out, '.git'))).toBe(false);
	expect(fs.existsSync(path.join(out, '_draft'))).toBe(false);
});
