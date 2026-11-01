import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hasLualatex } from '../../lib/draw/engines/lualatexEngine';
import { releaseDrawing, renderPicture, warmDrawingCount } from '../../../../../../electron/src/draw/drawDaemon';

const LUA_DIR = path.resolve(import.meta.dirname, '../../../../../../electron/lua');
const PICTURE = '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}';
const PAPER_A = '\\documentclass{article}\\usepackage{tikz}';
const PAPER_B = '\\documentclass{article}\\usepackage{tikz}\\usetikzlibrary{calc}';
const draw = (preamble: string, window: number) =>
	renderPicture({ root: os.tmpdir(), preamble, picture: PICTURE, luaDir: LUA_DIR }, window) as Promise<{ errors: string[] }>;

describe.skipIf(!hasLualatex)('warm lualatex for two papers in two windows', () => {
	it('keeps a process per preamble, and one window letting go leaves the other drawing', async () => {
		await draw(PAPER_A, 1);
		await draw(PAPER_B, 2);
		await draw(PAPER_A, 1);
		expect(warmDrawingCount()).toBe(2);
		const other = draw(PAPER_B, 2);
		releaseDrawing(1);
		expect((await other).errors).toEqual([]);
		await vi.waitFor(() => expect(warmDrawingCount()).toBe(1));
		releaseDrawing(2);
		await vi.waitFor(() => expect(warmDrawingCount()).toBe(0));
	}, 60_000);
});
