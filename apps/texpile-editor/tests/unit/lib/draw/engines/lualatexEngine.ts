import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import type { EngineResult } from '$lib/draw/tikz/tikzResult';
import { engineFile, renderPicture, stopDrawing } from '../../../../../../../electron/src/draw/drawDaemon';

const LUA_DIR = path.resolve(import.meta.dirname, '../../../../../../../electron/lua');

export const hasLualatex = spawnSync('lualatex', ['--version'], { stdio: 'ignore' }).status === 0;

/** ends the warm lualatex when the file's tests are done */
export function useLualatex(): void {
	afterAll(() => stopDrawing());
}

/** one instrumented picture under a preamble, drawn by the app's own lualatex; `root` is where the document's files are */
export function drawWithLualatex(preamble: string, picture: string, root = os.tmpdir()): Promise<EngineResult> {
	return renderPicture({ root, preamble, picture, luaDir: LUA_DIR }) as Promise<EngineResult>;
}

/** a font or image file the engine reported */
export async function readLualatexFile(reported: string): Promise<ArrayBuffer> {
	const bytes = engineFile(reported);
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** the editor's engine for one preamble */
export function lualatexEngine(preamble: string, root?: string): FigureEngine {
	return { render: (job) => drawWithLualatex(preamble, job, root), readFont: readLualatexFile };
}
