import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import type { TypstResult } from '$lib/draw/cetz/typstResult';
import { releaseCetz, renderCetz } from '../../../../../../../electron/src/draw/cetzEngine';

const USER_DATA = path.join(os.tmpdir(), 'texpile-draw-tests');

// the window the tests draw for
const TEST_WINDOW = 1;

export const hasTinymist = spawnSync('tinymist', ['--version'], { stdio: 'ignore' }).status === 0;

/** ends the warm tinymist when the file's tests are done */
export function useTinymist(): void {
	afterAll(() => releaseCetz(TEST_WINDOW));
}

/** one whole Typst document drawn by the app's own tinymist, as the text of `file` in the folder `root` */
export function drawWithTinymist(job: string, root = os.tmpdir(), file = path.join(root, 'figure.typ')): Promise<TypstResult> {
	return renderCetz(USER_DATA, { root, path: file, job }, TEST_WINDOW) as Promise<TypstResult>;
}

export const tinymistEngine: FigureEngine = { render: (job) => drawWithTinymist(job) };
