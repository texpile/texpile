import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFigure, writeFigure } from '../../../../../../electron/src/draw/figureStore';

const made: string[] = [];
function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figure-store-'));
	made.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const name = (i: number) => i.toString(16).padStart(16, '0');

describe('the figure store', () => {
	it('keeps the newest pictures and refuses a name that is not one of its own', async () => {
		const home = path.join(tempDir(), 'Figures');
		for (let i = 0; i < 4; i++) {
			await writeFigure(home, name(i), `<svg>${i}</svg>`, 3);
			fs.utimesSync(path.join(home, `${name(i)}.svg`), i + 1, i + 1);
		}
		await writeFigure(home, name(9), '<svg>9</svg>', 3);
		expect(await readFigure(home, name(0))).toBeNull();
		expect((await readFigure(home, name(9)))?.svg).toBe('<svg>9</svg>');
		expect(fs.readdirSync(home)).toHaveLength(3);
		await expect(writeFigure(home, '../../outside', 'x')).rejects.toThrow();
	});
});
