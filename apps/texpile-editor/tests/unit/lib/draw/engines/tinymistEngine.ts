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

/** one whole Typst document drawn by the app's own tinymist */
export function drawWithTinymist(job: string): Promise<TypstResult> {
	return renderCetz(USER_DATA, job, TEST_WINDOW);
}

export const tinymistEngine: FigureEngine = { render: drawWithTinymist };
