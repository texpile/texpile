import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

// a lualatex that is not installed: spawn answers with ENOENT and nothing ever exits
vi.mock('node:child_process', () => ({
	spawn: () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
			stdin: Object.assign(new EventEmitter(), { write: () => true }),
			kill: () => true
		});
		setTimeout(() => child.emit('error', Object.assign(new Error('spawn lualatex ENOENT'), { code: 'ENOENT' })), 5);
		return child;
	}
}));

const { renderPicture } = await import('../../../../../../electron/src/draw/drawDaemon');

describe('drawDaemon', () => {
	it('reports a missing lualatex at once, and the next picture asks again', async () => {
		const job = { root: '/tmp', preamble: '\\documentclass{article}', picture: '', luaDir: '/tmp' };
		await expect(renderPicture(job)).rejects.toThrow('program missing: lualatex');
		await expect(renderPicture(job)).rejects.toThrow('program missing: lualatex');
	}, 3000);
});
